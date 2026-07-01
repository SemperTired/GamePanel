import "dotenv/config";
import { Worker } from "bullmq";
import { Pool } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { RuntimePortBinding, RuntimeTarget } from "@aetherpanel/shared";
import { buildInstallPlan, loadTemplates, prepareServiceFiles, writeManagedConfigFiles } from "@aetherpanel/templates";

const execFileAsync = promisify(execFile);

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

async function prepareInstallFiles(service: any, template: any, requestId: string, node: Record<string, unknown> = {}) {
  const plan = buildInstallPlan(template, service.id, {
    dataRoot: typeof node.data_root === "string" && node.data_root.trim() ? node.data_root : undefined,
    cacheRoot: typeof node.cache_root === "string" && node.cache_root.trim() ? node.cache_root : undefined,
  });
  await updateJob(requestId, "installing", { step: "prepare_files", install: plan });
  if (process.env.AETHERPANEL_RUN_INSTALLERS === "true" && plan.commands.length) await updateJob(requestId, "installing", { step: "run_installer", command_count: plan.commands.length });
  await prepareServiceFiles(plan, { runInstallers: process.env.AETHERPANEL_RUN_INSTALLERS === "true", variables: service.startup_variables || {} });
  await writeManagedConfigFiles(plan, template, service.startup_variables || {});
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

async function loadEnabledConnector(connectorId?: string) {
  const query = connectorId
    ? await pool.query("select data from infrastructure_connectors where id = $1", [connectorId])
    : await pool.query("select data from infrastructure_connectors where coalesce((data->>'enabled')::boolean, true) = true order by created_at asc limit 1");
  return query.rows[0]?.data || null;
}

function splitSetCookie(value: string | null) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/g);
}

async function unifiSession(connector: any) {
  const baseUrl = String(connector.base_url || "").replace(/\/$/, "");
  const session: any = { baseUrl, siteId: connector.site_id || "default", apiKey: connector.api_key };
  if (connector.api_key) return session;

  allowLocalUnifiCertificate(baseUrl);
  const loginPaths = ["/api/auth/login", "/api/login"];
  let response: Response | null = null;
  let lastError = "";
  for (const path of loginPaths) {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username: connector.username, password: connector.password }),
    });
    if (response.ok) break;
    const text = await response.text();
    lastError = `HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`;
    if (response.status !== 404) break;
  }
  if (!response?.ok) throw new Error(`UniFiOS login failed with ${lastError || "no response"}`);
  const setCookie = (response.headers as any).getSetCookie?.() || splitSetCookie(response.headers.get("set-cookie"));
  session.cookie = setCookie.map((cookie: string) => cookie.split(";")[0]).join("; ");
  session.csrfToken = response.headers.get("x-csrf-token") || undefined;
  return session;
}

function allowLocalUnifiCertificate(baseUrl: string) {
  if (/^https:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(baseUrl) && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

function portForwardPath(siteId: string) {
  return `/proxy/network/api/s/${encodeURIComponent(siteId)}/rest/portforward`;
}

async function unifiRequest(session: any, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (session.cookie) headers.Cookie = session.cookie;
  if (session.csrfToken) headers["X-CSRF-Token"] = session.csrfToken;
  if (session.apiKey) headers["X-API-KEY"] = session.apiKey;
  const paths = [path, path.replace("/proxy/network", "")];
  let lastError = "";
  for (const candidate of paths) {
    const response = await fetch(`${session.baseUrl}${candidate}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 404 && candidate !== paths[paths.length - 1]) continue;
    const text = await response.text();
    const payload = text ? parseJson(text) : {};
    if (response.ok) return payload;
    lastError = `HTTP ${response.status}${text ? `: ${text.slice(0, 220)}` : ""}`;
    if (response.status !== 404) break;
  }
  throw new Error(`UniFiOS ${method} ${path} failed: ${lastError}`);
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function ruleId(rule: any) {
  return rule?._id || rule?.id;
}

function toUnifiRules(connector: any, mapping: any) {
  const protocols = mapping.protocol === "both" ? ["tcp", "udp"] : [mapping.protocol || "tcp"];
  return protocols.map((protocol) => ({
    name: `${mapping.name} ${String(protocol).toUpperCase()}`.slice(0, 63),
    enabled: true,
    proto: protocol,
    src: connector.source_ip || "any",
    dst_port: String(mapping.external_port),
    fwd_ip: mapping.internal_ip,
    fwd_port: String(mapping.internal_port),
    log: false,
    wan_interface: connector.wan_interface || "wan",
  }));
}

function findExistingRule(existing: any[], rule: any) {
  return existing.find((candidate) => candidate.name === rule.name)
    || existing.find((candidate) =>
      String(candidate.dst_port) === String(rule.dst_port)
      && String(candidate.fwd_port) === String(rule.fwd_port)
      && candidate.fwd_ip === rule.fwd_ip
      && String(candidate.proto || candidate.protocol || "").toLowerCase() === String(rule.proto).toLowerCase());
}

function networkApplyRequired() {
  return String(process.env.REQUIRE_NETWORK_APPLY || "").toLowerCase() === "true";
}

function failedNetworkMappings(mappings: any[]) {
  return mappings.filter((mapping) => mapping.applied !== true && mapping.applied !== "dry_run");
}

async function applyNetworkMappings(service: any, mappings: any[]) {
  const connector = await loadEnabledConnector();
  if (!connector) return mappings.map((mapping) => ({ ...mapping, applied: false, error: "No infrastructure connector is configured" }));
  const internalIp = connector.internal_ip || connector.gateway_ip || process.env.NODE_LAN_IP || process.env.NODE_BIND_IP || "127.0.0.1";
  const prepared = mappings.map((mapping) => ({
    ...mapping,
    internal_ip: internalIp,
    wan_ip: connector.wan_ip || process.env.AETHERNODE_WAN_IP || mapping.wan_ip || "",
  }));
  if (connector.provider !== "unifi_os") return prepared.map((mapping) => ({ ...mapping, applied: false, error: `${connector.provider} connector records mappings only` }));
  if (connector.dry_run || process.env.NETWORK_APPLY_MODE !== "live") return prepared.map((mapping) => ({ ...mapping, applied: "dry_run" }));

  let session: any = null;
  let existing: any[] = [];
  try {
    session = await unifiSession(connector);
    const existingPayload = await unifiRequest(session, "GET", portForwardPath(session.siteId));
    existing = Array.isArray(existingPayload?.data) ? existingPayload.data : Array.isArray(existingPayload) ? existingPayload : [];
  } catch (error) {
    if (!connector.ssh_host && connector.provider !== "unifi_os") throw error;
    return applyUnifiSshPortForwards(connector, service, prepared, error);
  }
  const appliedMappings = [];
  for (const mapping of prepared) {
    const ruleIds: string[] = [];
    const errors: string[] = [];
    for (const rule of toUnifiRules(connector, mapping)) {
      try {
        const match = findExistingRule(existing, rule);
        const id = ruleId(match);
        const path = id ? `${portForwardPath(session.siteId)}/${id}` : portForwardPath(session.siteId);
        const saved = await unifiRequest(session, id ? "PUT" : "POST", path, match ? { ...match, ...rule } : rule);
        const savedRule = saved?.data?.[0] || saved?.data || saved || rule;
        const savedId = ruleId(savedRule);
        if (savedId) ruleIds.push(savedId);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    appliedMappings.push({ ...mapping, applied: errors.length === 0, rule_ids: ruleIds, error: errors.join(" | ") || undefined });
  }
  await pool.query(
    "insert into audit_logs(id, actor, action, target, metadata, created_at) values($1, $2, $3, $4, $5, now()) on conflict(id) do nothing",
    [crypto.randomUUID(), "worker", "network.port_forward.apply", service.id, JSON.stringify({ connector_id: connector.id, mappings: appliedMappings })],
  );
  return appliedMappings;
}

async function applyUnifiSshPortForwards(connector: any, service: any, mappings: any[], apiError?: unknown) {
  const host = connector.ssh_host || connector.gateway_host || hostnameFromUrl(connector.base_url) || "192.168.1.1";
  const username = connector.ssh_username || connector.username || "root";
  const password = connector.ssh_password || connector.password;
  if (!password) throw new Error("UniFiOS SSH password is required for SSH port automation");
  const wanInterface = normalizeSshWanInterface(connector.ssh_wan_interface || connector.wan_interface || "eth8");
  const lanCidr = connector.lan_cidr || "10.1.10.0/24";
  const results = [];
  const failures: string[] = [];
  for (const mapping of mappings) {
    const errors: string[] = [];
    for (const protocol of mapping.protocol === "both" ? ["tcp", "udp"] : [mapping.protocol || "tcp"]) {
      const comment = shellSafe(`aetherpanel-${service.id}-${mapping.external_port}-${protocol}`);
      const ruleCommands = [
        `iptables -t nat -C PREROUTING -i ${shellSafe(wanInterface)} -p ${shellSafe(protocol)} --dport ${Number(mapping.external_port)} -m comment --comment ${comment} -j DNAT --to-destination ${shellSafe(mapping.internal_ip)}:${Number(mapping.internal_port)} 2>/dev/null || iptables -t nat -I PREROUTING 1 -i ${shellSafe(wanInterface)} -p ${shellSafe(protocol)} --dport ${Number(mapping.external_port)} -m comment --comment ${comment} -j DNAT --to-destination ${shellSafe(mapping.internal_ip)}:${Number(mapping.internal_port)}`,
        `iptables -C FORWARD -p ${shellSafe(protocol)} -d ${shellSafe(mapping.internal_ip)} --dport ${Number(mapping.internal_port)} -m comment --comment ${comment} -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -p ${shellSafe(protocol)} -d ${shellSafe(mapping.internal_ip)} --dport ${Number(mapping.internal_port)} -m comment --comment ${comment} -j ACCEPT`,
        `iptables -t nat -C POSTROUTING -s ${shellSafe(lanCidr)} -d ${shellSafe(mapping.internal_ip)} -p ${shellSafe(protocol)} --dport ${Number(mapping.internal_port)} -m comment --comment ${comment}-hairpin -j MASQUERADE 2>/dev/null || iptables -t nat -I POSTROUTING 1 -s ${shellSafe(lanCidr)} -d ${shellSafe(mapping.internal_ip)} -p ${shellSafe(protocol)} --dport ${Number(mapping.internal_port)} -m comment --comment ${comment}-hairpin -j MASQUERADE`,
      ];
      const script = withPersistentUnifiBootRules(ruleCommands, `aetherpanel-${service.id}-${mapping.external_port}-${protocol}`);
      try {
        await sshCommand(host, username, password, script);
        results.push(`${mapping.external_port}/${protocol}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (errors.length) failures.push(...errors);
    Object.assign(mapping, { applied: errors.length === 0, rule_ids: errors.length ? [] : results, error: errors.join(" | ") || undefined });
  }
  if (failures.length) throw new Error(`UniFiOS SSH port automation failed${apiError ? ` after API fallback: ${apiError instanceof Error ? apiError.message : String(apiError)}` : ""}: ${failures.join(" | ")}`);
  return mappings;
}

async function sshCommand(host: string, username: string, password: string, command: string) {
  await execFileAsync("sshpass", [
    "-p", password,
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    `${username}@${host}`,
    command,
  ], { timeout: 30000, maxBuffer: 1024 * 1024 });
}

function hostnameFromUrl(value: string) {
  try {
    return value ? new URL(value).hostname : "";
  } catch {
    return "";
  }
}

function shellSafe(value: string) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function normalizeSshWanInterface(value: string) {
  return !value || value === "wan" ? "eth8" : value;
}

function withPersistentUnifiBootRules(commands: string[], marker: string) {
  const file = "/data/on_boot.d/aetherpanel-port-forwards.sh";
  const body = commands.join("\n");
  return [
    "mkdir -p /data/on_boot.d",
    `[ -s ${file} ] || printf '#!/bin/sh\\n' > ${file}`,
    `chmod +x ${file}`,
    commands.join(" && "),
    `grep -F ${shellSafe(marker)} ${file} >/dev/null 2>&1 || cat >> ${file} <<'AETHERPANEL_RULE'\n${body}\nAETHERPANEL_RULE`,
  ].join(" && ");
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
  const installPlan = await prepareInstallFiles(service, template, requestId, node);

  await pool.query("update services set status = $1, data = data || $2::jsonb, updated_at = now() where id = $3", [
    "installing",
    JSON.stringify({ status: "installing", updated_at: new Date().toISOString() }),
    serviceId,
  ]);

  const runtimeId = await runtime.create({
    serviceId: service.id,
    name: service.name,
    image: installPlan.image,
    environment: { ...template.environment, ...(service.startup_variables || {}) },
    ports: service.ports as RuntimePortBinding[],
    volumeName: `aether_${service.id.replaceAll("-", "").slice(0, 12)}`,
    hostDataPath: installPlan.servicePath,
    memoryMb: template.resources.recommended_ram_mb,
    dataPath: "/data",
    startupCommand: template.install.method === "docker_image" ? undefined : template.runtime.startup,
    installPlan,
  });

  let networkMappings = buildNetworkMappings(service);
  try {
    await updateJob(requestId, "installing", { step: "network_apply" });
    networkMappings = await applyNetworkMappings(service, networkMappings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    networkMappings = networkMappings.map((mapping: any) => ({ ...mapping, applied: false, error: message }));
  }

  const failedMappings = failedNetworkMappings(networkMappings);
  if (networkApplyRequired() && failedMappings.length) {
    const details = failedMappings.map((mapping) => `${mapping.external_port || mapping.host_port}/${mapping.protocol || "tcp"}: ${mapping.error || "not applied"}`).join("; ");
    await pool.query(
      "update services set status = $1, power_state = $2, data = data || $3::jsonb, updated_at = now() where id = $4",
      [
        "failed",
        "failed",
        JSON.stringify({
          runtime_id: runtimeId,
          status: "failed",
          power_state: "failed",
          install: installPlan,
          network_mappings: networkMappings,
          provision_error: `Network automation failed: ${details}`,
          updated_at: new Date().toISOString(),
        }),
        serviceId,
      ],
    );
    throw new Error(`Network automation failed: ${details}`);
  }

  const patch = { runtime_id: runtimeId, status: "active", power_state: "created", install: installPlan, network_mappings: networkMappings, updated_at: new Date().toISOString() };
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
