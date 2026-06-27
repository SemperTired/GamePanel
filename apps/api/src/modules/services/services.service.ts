import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import fs from "node:fs/promises";
import path from "node:path";
import { PortProtocol, RuntimeTarget, createServiceSchema } from "@aetherpanel/shared";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { buildInstallPlan, prepareServiceFiles, refreshInstallCache, writeManagedConfigFiles } from "@aetherpanel/templates";
import { DataStore, ServiceRecord } from "../data.module.js";
import { TemplatesService } from "../templates/templates.service.js";
import { InfrastructureService } from "../infrastructure/infrastructure.service.js";

@Injectable()
export class ServicesService {
  constructor(private readonly data: DataStore, private readonly templates: TemplatesService, private readonly infrastructure: InfrastructureService) {}

  list(user?: { sub?: string; role?: string }) {
    const records = [...this.data.services.values()];
    if (user?.role === "customer") return records.filter((service) => service.owner_user_id === user.sub);
    return records;
  }

  get(id: string) {
    const service = this.data.services.get(id);
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  async update(id: string, input: unknown) {
    const service = this.get(id);
    if (!input || typeof input !== "object") throw new BadRequestException("Update body is required");
    const body = input as Record<string, unknown>;
    if (typeof body.name === "string" && body.name.trim()) service.name = body.name.trim();
    if (typeof body.owner_user_id === "string" && body.owner_user_id.trim()) {
      if (!this.data.users.has(body.owner_user_id)) throw new BadRequestException("Unknown owner_user_id");
      service.owner_user_id = body.owner_user_id;
    }
    if (typeof body.node_id === "string" && body.node_id.trim()) service.node_id = body.node_id;
    if (typeof body.location_id === "string" && body.location_id.trim()) service.location_id = body.location_id;
    if (typeof body.status === "string" && ["pending_payment", "paid", "queued", "provisioning", "installing", "active", "suspended", "terminated", "failed"].includes(body.status)) service.status = body.status;
    if (body.startup_variables && typeof body.startup_variables === "object") {
      service.startup_variables = { ...(service.startup_variables || {}), ...(body.startup_variables as Record<string, string>) };
    }
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async create(input: unknown): Promise<ServiceRecord> {
    const normalized = this.normalizeCreateInput(input);
    const payload = createServiceSchema.parse(normalized);
    const template = this.templates.get(payload.template_id);
    if (!template) throw new BadRequestException("Unknown template");
    const now = new Date().toISOString();
    const serviceId = crypto.randomUUID();
    const installPlan = buildInstallPlan(template, serviceId);
    const service: ServiceRecord = {
      id: serviceId,
      name: payload.name,
      template_id: payload.template_id,
      owner_user_id: payload.owner_user_id,
      status: "pending_payment",
      power_state: "created",
      location_id: payload.location_id,
      node_id: payload.node_id || "local",
      install: installPlan,
      ports: this.allocatePorts(template.ports.map((port) => ({
        key: port.key,
        preferred: port.default,
        container: port.default,
        protocol: port.protocol,
      }))),
      mods: [],
      startup_variables: this.defaultVariables(template, payload.name, payload.startup_variables),
      network_mappings: [],
      created_at: now,
      updated_at: now,
    };
    await this.data.saveService(service);
    return service;
  }

  private allocatePorts(requested: Array<{ key: string; preferred: number; container: number; protocol: PortProtocol }>) {
    const start = Number(process.env.PORT_POOL_START || 30000);
    const end = Number(process.env.PORT_POOL_END || 60000);
    const bindIp = process.env.NODE_BIND_IP || "0.0.0.0";
    const used = new Set([...this.data.services.values()].flatMap((service) => service.ports.flatMap((port) => this.portKeys(port.host, port.protocol))));
    const sorted = [...requested].sort((a, b) => a.preferred - b.preferred);
    const primary = sorted[0]?.preferred || start;
    const stride = Number(process.env.PORT_INSTANCE_STRIDE || Math.max(10, sorted.length * 2 + 2));
    const offsets = new Map(sorted.map((port, index) => [port.key, Math.max(0, port.preferred - primary) || index * 2]));
    let base = start;
    while (base <= end) {
      const candidate = requested.map((port) => ({
        ...port,
        host: base + (offsets.get(port.key) ?? 0),
      }));
      const fits = candidate.every((port) => port.host <= end && this.portKeys(port.host, port.protocol).every((key) => !used.has(key)));
      if (fits) {
        for (const port of candidate) for (const key of this.portKeys(port.host, port.protocol)) used.add(key);
        return candidate.map((port) => ({ key: port.key, host: port.host, container: port.container, protocol: port.protocol, host_ip: bindIp }));
      }
      base += stride;
    }
    throw new BadRequestException("No available contiguous port block in the configured port pool");
  }

  private portKeys(port: number, protocol: PortProtocol) {
    return protocol === "both" ? [`${port}/tcp`, `${port}/udp`] : [`${port}/${protocol}`];
  }

  private defaultVariables(template: NonNullable<ReturnType<TemplatesService["get"]>>, serviceName: string, overrides: Record<string, string> = {}) {
    const generated = {
      ServerGUID: crypto.randomUUID(),
      SERVER_NAME: serviceName,
      ServerName: serviceName.replace(/\s+/g, "_"),
    };
    const values: Record<string, string> = {};
    for (const field of template.config_schema.fields) values[field.key] = this.resolveDefaultValue(field.default, generated);
    for (const variable of template.startup_variables) values[variable.key] = this.resolveDefaultValue(variable.default, generated);
    return {
      ...values,
      SERVER_NAME: values.SERVER_NAME || generated.SERVER_NAME,
      ServerName: values.ServerName || generated.ServerName,
      ...overrides,
    };
  }

  private resolveDefaultValue(value: string | undefined, generated: Record<string, string>) {
    if (!value) return "";
    if (value === "{{newguid()}}") return generated.ServerGUID;
    return value.replace(/\{\{newguid\(\)\}\}/g, crypto.randomUUID());
  }

  private normalizeCreateInput(input: unknown) {
    if (!input || typeof input !== "object") return input;
    const body = input as Record<string, any>;
    const resources = body.resources && typeof body.resources === "object" ? body.resources as Record<string, any> : {};
    const first = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null);
    return {
      ...body,
      template_id: first(body.template_id, body.templateId),
      owner_user_id: first(body.owner_user_id, body.ownerUserId, body.customerId),
      location_id: first(body.location_id, body.locationId),
      node_id: first(body.node_id, body.nodeId),
      memory_mb: first(body.memory_mb, body.memoryMb, resources.memoryMb, resources.memory_mb),
      disk_gb: first(body.disk_gb, body.diskGb, resources.storageGb, resources.disk_gb),
      cpu_limit: first(body.cpu_limit, body.cpuLimit, resources.cpu),
      auto_start: first(body.auto_start, body.autoStart),
      startup_variables: first(body.startup_variables, body.startupVariables),
    };
  }

  async provision(id: string) {
    const service = this.get(id);
    const template = this.templates.get(service.template_id);
    if (!template) throw new BadRequestException("Unknown template");
    service.status = "installing";
    service.power_state = "installing";
    service.provision_error = undefined;
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    try {
      const installPlan = buildInstallPlan(template, service.id);
      this.assertInstallReadiness(installPlan);
      await prepareServiceFiles(installPlan, { runInstallers: process.env.AETHERPANEL_RUN_INSTALLERS === "true", variables: service.startup_variables || {} });
      await writeManagedConfigFiles(installPlan, template, service.startup_variables || {});
      const runtime = createDockerRuntime(this.runtimeTargetForService(service));
      const runtimeId = await runtime.create({
        serviceId: service.id,
        name: service.name,
        image: installPlan.image,
        environment: { ...template.environment, ...(service.startup_variables || {}) },
        ports: service.ports,
        volumeName: `aether_${service.id.replaceAll("-", "").slice(0, 12)}`,
        hostDataPath: installPlan.servicePath,
        memoryMb: template.resources.recommended_ram_mb,
        dataPath: "/data",
        startupCommand: template.runtime.startup,
        installPlan,
      });
      service.runtime_id = runtimeId;
      service.status = "active";
      service.power_state = "created";
      service.install = installPlan;
      try {
        service.network_mappings = (await this.infrastructure.applyForService(service.id)).mappings;
      } catch {
        service.network_mappings = this.infrastructure.planForService(service.id).mappings;
      }
    } catch (error) {
      service.status = "failed";
      service.power_state = "failed";
      service.provision_error = error instanceof Error ? error.message : String(error);
      await this.data.saveService(service);
      throw error;
    }
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async power(id: string, action: "start" | "stop" | "restart" | "kill") {
    const service = this.get(id);
    if (!service.runtime_id) await this.provision(id);
    const current = this.get(id);
    const runtimeId = current.runtime_id!;
    const runtime = createDockerRuntime(this.runtimeTargetForService(current));
    if (action === "start") await runtime.start(runtimeId);
    if (action === "stop") await runtime.stop(runtimeId);
    if (action === "restart") await runtime.restart(runtimeId);
    if (action === "kill") await runtime.kill(runtimeId);
    current.power_state = action === "stop" || action === "kill" ? "stopped" : "running";
    current.updated_at = new Date().toISOString();
    await this.data.saveService(current);
    return current;
  }

  async reinstall(id: string) {
    const service = this.get(id);
    if (service.runtime_id) {
      const runtime = createDockerRuntime(this.runtimeTargetForService(service));
      await runtime.stop(service.runtime_id).catch(() => undefined);
      await runtime.delete(service.runtime_id).catch(() => undefined);
      service.runtime_id = undefined;
    }
    service.status = "queued";
    service.power_state = "reinstalling";
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return this.provision(id);
  }

  async refreshCache(id: string) {
    const service = this.get(id);
    const template = this.templates.get(service.template_id);
    if (!template) throw new BadRequestException("Unknown template");
    const plan = buildInstallPlan(template, service.id);
    await refreshInstallCache(plan);
    service.install = plan;
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return { ok: true, cache_key: plan.cacheKey, cache_path: plan.cachePath, warnings: plan.warnings };
  }

  async backups(id: string) {
    const service = this.get(id);
    const agent = this.agentForService(service);
    if (agent) return this.agentRequest(agent, `/backups/${service.id}`);
    const root = path.resolve(process.env.AETHERPANEL_BACKUP_ROOT || path.join(process.cwd(), "var", "backups"), service.id);
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const stat = await fs.stat(path.join(root, entry.name));
      return { name: entry.name, size: stat.size, created_at: stat.birthtime.toISOString(), updated_at: stat.mtime.toISOString() };
    }));
  }

  async createBackup(id: string) {
    const service = this.get(id);
    const agent = this.agentForService(service);
    if (agent) return this.agentRequest(agent, `/backups/${service.id}`, { method: "POST" });
    const source = path.resolve(process.env.AETHERPANEL_DATA_ROOT || path.join(process.cwd(), "var", "services"), service.id);
    const root = path.resolve(process.env.AETHERPANEL_BACKUP_ROOT || path.join(process.cwd(), "var", "backups"), service.id);
    await fs.mkdir(root, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`;
    const target = path.join(root, name);
    await fs.writeFile(target, JSON.stringify({ service_id: service.id, source, created_at: new Date().toISOString() }, null, 2));
    const stat = await fs.stat(target);
    return { name, path: target, size: stat.size, created_at: stat.birthtime.toISOString() };
  }

  async restoreBackup(id: string, name: string) {
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\") || !name.endsWith(".tar.gz")) {
      throw new BadRequestException("Invalid backup name");
    }
    const service = this.get(id);
    if (service.runtime_id) {
      await createDockerRuntime(this.runtimeTargetForService(service)).stop(service.runtime_id).catch(() => undefined);
      service.power_state = "stopped";
    }
    const agent = this.agentForService(service);
    let result: unknown;
    if (agent) {
      result = await this.agentRequest(agent, `/backups/${service.id}`, { method: "PUT", body: JSON.stringify({ name }) });
    } else {
      const root = path.resolve(process.env.AETHERPANEL_DATA_ROOT || path.join(process.cwd(), "var", "services"), service.id);
      const backupRoot = path.resolve(process.env.AETHERPANEL_BACKUP_ROOT || path.join(process.cwd(), "var", "backups"), service.id);
      const source = path.resolve(backupRoot, name);
      if (!source.startsWith(backupRoot)) throw new BadRequestException("Unsafe backup path");
      await fs.stat(source);
      await fs.rm(root, { recursive: true, force: true });
      await fs.mkdir(root, { recursive: true });
      result = { ok: true, name, restored_at: new Date().toISOString() };
    }
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return result;
  }

  async suspend(id: string) {
    const service = this.get(id);
    if (service.runtime_id) await createDockerRuntime(this.runtimeTargetForService(service)).stop(service.runtime_id).catch(() => undefined);
    service.status = "suspended";
    service.power_state = "stopped";
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async activate(id: string) {
    const service = this.get(id);
    service.status = service.runtime_id ? "active" : "pending_payment";
    service.power_state = service.runtime_id ? service.power_state : "created";
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async delete(id: string) {
    const service = this.get(id);
    if (service.runtime_id) {
      const runtime = createDockerRuntime(this.runtimeTargetForService(service));
      await runtime.stop(service.runtime_id).catch(() => undefined);
      await runtime.delete(service.runtime_id).catch(() => undefined);
    }
    await this.deleteServiceFiles(service).catch(() => undefined);
    this.data.services.delete(id);
    if (this.data.databaseOnline) await this.data.pool.query("delete from services where id = $1", [id]);
    return { ok: true, id };
  }

  private async deleteServiceFiles(service: ServiceRecord) {
    const agent = this.agentForService(service);
    if (agent) {
      const response = await fetch(`${agent.url}/files/${service.id}`, { method: "DELETE", headers: this.agentHeaders(agent) });
      if (!response.ok) throw new Error(`Agent file delete failed ${response.status}`);
      return;
    }
    const root = path.resolve(process.env.AETHERPANEL_DATA_ROOT || path.join(process.cwd(), "var", "services"));
    const target = path.resolve(root, service.id);
    if (!target.startsWith(root)) throw new BadRequestException("Unsafe service path");
    await fs.rm(target, { recursive: true, force: true });
  }

  private agentForService(service: ServiceRecord) {
    const node = (service.node_id ? this.data.nodes.get(service.node_id) : null) as Record<string, unknown> | null;
    const url = String(node?.agent_url || "");
    if (!url) return null;
    return { url: url.replace(/\/$/, ""), token: String(node?.agent_token || process.env.AETHERPANEL_AGENT_TOKEN || "") };
  }

  private agentHeaders(agent: { token: string }) {
    return {
      "Content-Type": "application/json",
      ...(agent.token ? { Authorization: `Bearer ${agent.token}` } : {}),
    };
  }

  private async agentRequest(agent: { url: string; token: string }, route: string, init: RequestInit = {}) {
    const response = await fetch(`${agent.url}${route}`, { ...init, headers: { ...this.agentHeaders(agent), ...(init.headers || {}) } });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new BadRequestException(body?.message || `Agent request failed ${response.status}`);
    return body;
  }

  async logs(id: string) {
    const service = this.get(id);
    const runtime = createDockerRuntime(this.runtimeTargetForService(service));
    return service.runtime_id ? runtime.logs(service.runtime_id) : "[panel] Service has not been provisioned yet.";
  }

  async stats(id: string) {
    const service = this.get(id);
    const runtime = createDockerRuntime(this.runtimeTargetForService(service));
    return service.runtime_id ? runtime.stats(service.runtime_id) : { running: false, cpu_percent: 0, memory_mb: 0, memory_limit_mb: 0 };
  }

  async command(id: string, command: string) {
    const service = this.get(id);
    if (!service.runtime_id) return { ok: false };
    const runtime = createDockerRuntime(this.runtimeTargetForService(service));
    return { ok: await runtime.sendCommand(service.runtime_id, command) };
  }

  private runtimeTargetForService(service: ServiceRecord): RuntimeTarget {
    const node = (service.node_id ? this.data.nodes.get(service.node_id) : null) as Record<string, unknown> | null;
    return {
      mode: String(node?.runtime_mode || node?.mode || (node?.agent_url ? "agent" : node?.docker_host ? "docker_host" : "local")) as RuntimeTarget["mode"],
      docker_host: String(node?.docker_host || process.env.DOCKER_HOST || ""),
      agent_url: String(node?.agent_url || ""),
      agent_token: String(node?.agent_token || process.env.AETHERPANEL_AGENT_TOKEN || ""),
    };
  }

  private assertInstallReadiness(installPlan: ReturnType<typeof buildInstallPlan>) {
    if (process.env.AETHERPANEL_STRICT_TEMPLATE_READINESS === "false") return;
    const missingEnv = installPlan.readiness.required_env.filter((key) => !process.env[key]);
    const blockers = [
      ...missingEnv.map((key) => `Missing environment variable ${key}`),
      ...installPlan.readiness.operator_actions,
    ];
    if (blockers.length) throw new BadRequestException(`Template is not ready for live provisioning: ${blockers.join("; ")}`);
  }
}
