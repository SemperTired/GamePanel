import "dotenv/config";
import { Worker } from "bullmq";
import { Pool } from "pg";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { RuntimePortBinding } from "@aetherpanel/shared";
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

const runtime = createDockerRuntime();

async function updateJob(requestId: string, status: string, data: Record<string, unknown> = {}) {
  await pool.query(
    "update provisioning_jobs set status = $1, data = data || $2::jsonb, updated_at = now() where id = $3",
    [status, JSON.stringify(data), requestId],
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
  });

  const patch = { runtime_id: runtimeId, status: "active", power_state: "created", install: installPlan, network_mappings: buildNetworkMappings(service), updated_at: new Date().toISOString() };
  await pool.query(
    "update services set status = $1, power_state = $2, data = data || $3::jsonb, updated_at = now() where id = $4",
    ["active", "created", JSON.stringify(patch), serviceId],
  );
  await updateJob(requestId, "completed", { runtime_id: runtimeId, completed_at: new Date().toISOString() });
  return patch;
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
  if (requestId) await updateJob(requestId, "failed", { error: error.message, failed_at: new Date().toISOString() }).catch(() => undefined);
});

console.log("AetherPanel provisioning worker started");
