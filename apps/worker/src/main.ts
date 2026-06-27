import "dotenv/config";
import { Worker } from "bullmq";
import { Pool } from "pg";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { RuntimePortBinding, RuntimeTarget } from "@aetherpanel/shared";
import { buildInstallPlan, loadTemplates, prepareServiceFiles } from "@aetherpanel/templates";

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "aetherpanel",
  user: process.env.POSTGRES_USER || "aetherpanel",
  password: process.env.POSTGRES_PASSWORD || "change-me",
});

async function updateJob(requestId: string, status: string, data: Record<string, unknown> = {}) {
  await pool.query(
    "update provisioning_jobs set status = $1, data = data || $2::jsonb, updated_at = now() where id = $3",
    [status, JSON.stringify(data), requestId],
  );
}

async function markServiceFailed(serviceId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await pool.query(
    "update services set status = $1, power_state = $2, data = data || $3::jsonb, updated_at = now() where id = $4",
    ["failed", "failed", JSON.stringify({ status: "failed", power_state: "failed", provision_error: message, updated_at: new Date().toISOString() }), serviceId],
  );
}

async function prepareInstallFiles(service: any, template: any, requestId: string) {
  const plan = buildInstallPlan(template, service.id);
  await updateJob(requestId, "installing", { step: "prepare_files", install: plan });
  if (process.env.AETHERPANEL_RUN_INSTALLERS === "true" && plan.commands.length) await updateJob(requestId, "installing", { step: "run_installer", command_count: plan.commands.length });
  await prepareServiceFiles(plan, { runInstallers: process.env.AETHERPANEL_RUN_INSTALLERS === "true" });
  return plan;
}

function buildNetworkMappings(service: any) {
  const wanIp = process.env.AETHERNODE_WAN_IP || "";
  const internalIp = process.env.NODE_LAN_IP || process.env.NODE_BIND_IP || "127.0.0.1";
  return (service.ports || []).map((port: RuntimePortBinding) => ({
    id: `${service.id}-${port.key}-${port.host}-${port.protocol}`,
    name: `AetherPanel ${service.name} ${port.key}`,
    protocol: port.protocol,
    external_port: port.host,
    internal_port: port.host,
    internal_ip: internalIp,
    wan_ip: wanIp,
    enabled: true,
    applied: process.env.NETWORK_APPLY_MODE === "live" ? false : "dry_run",
  }));
}

async function provisionService(serviceId: string, requestId: string) {
  await updateJob(requestId, "provisioning");
  const serviceResult = await pool.query("select data from services where id = $1", [serviceId]);
  const service = serviceResult.rows[0]?.data;
  if (!service) throw new Error(`Service ${serviceId} not found`);
  const nodeResult = service.node_id ? await pool.query("select data from nodes where id = $1", [service.node_id]) : { rows: [] };
  const node = nodeResult.rows[0]?.data || {};
  const runtime = createDockerRuntime(runtimeTarget(node));

  const template = loadTemplates().find((candidate) => candidate.id === service.template_id);
  if (!template) throw new Error(`Template ${service.template_id} not found`);
  const installPlan = await prepareInstallFiles(service, template, requestId);

  await pool.query("update services set status = $1, data = data || $2::jsonb, updated_at = now() where id = $3", [
    "installing",
    JSON.stringify({ status: "installing", updated_at: new Date().toISOString() }),
    serviceId,
  ]);

  const runtimeId = await runtime.create({
    serviceId: service.id,
    name: service.name,
    image: installPlan.image,
    environment: template.environment,
    ports: service.ports as RuntimePortBinding[],
    volumeName: `aether_${service.id.replaceAll("-", "").slice(0, 12)}`,
    hostDataPath: installPlan.servicePath,
    memoryMb: template.resources.recommended_ram_mb,
    dataPath: "/data",
    startupCommand: template.runtime.startup,
    installPlan,
  });

  const patch = { runtime_id: runtimeId, status: "active", power_state: "created", install: installPlan, network_mappings: buildNetworkMappings(service), updated_at: new Date().toISOString() };
  await pool.query(
    "update services set status = $1, power_state = $2, data = data || $3::jsonb, updated_at = now() where id = $4",
    ["active", "created", JSON.stringify(patch), serviceId],
  );
  await updateJob(requestId, "completed", { runtime_id: runtimeId, completed_at: new Date().toISOString() });
  return patch;
}

function runtimeTarget(node: Record<string, unknown>): RuntimeTarget {
  return {
    mode: String(node.runtime_mode || node.mode || (node.agent_url ? "agent" : node.docker_host ? "docker_host" : "local")) as RuntimeTarget["mode"],
    docker_host: String(node.docker_host || process.env.DOCKER_HOST || ""),
    agent_url: String(node.agent_url || ""),
    agent_token: String(node.agent_token || process.env.AETHERPANEL_AGENT_TOKEN || ""),
  };
}

const worker = new Worker(
  "provisioning",
  async (job) => {
    const { serviceId, action, requestId } = job.data as { serviceId: string; action: string; requestId: string };
    console.log(`[worker] ${action} ${job.id}`, job.data);
    if (action !== "install") throw new Error(`Unsupported provisioning action: ${action}`);
    return provisionService(serviceId, requestId);
  },
  { connection, concurrency: Number(process.env.PROVISIONING_CONCURRENCY || 2) },
);

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", async (job, error) => {
  console.error(`[worker] failed ${job?.id}`, error);
  const requestId = job?.data?.requestId;
  const serviceId = job?.data?.serviceId;
  if (requestId) await updateJob(requestId, "failed", { error: error.message, failed_at: new Date().toISOString() }).catch(() => undefined);
  if (serviceId) await markServiceFailed(serviceId, error).catch(() => undefined);
});

console.log("AetherPanel provisioning worker started");
