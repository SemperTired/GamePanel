import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createServiceSchema } from "@aetherpanel/shared";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { DataStore, ServiceRecord } from "../data.module.js";
import { TemplatesService } from "../templates/templates.service.js";
import { InfrastructureService } from "../infrastructure/infrastructure.service.js";

const runtime = createDockerRuntime();

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

  async create(input: unknown): Promise<ServiceRecord> {
    const normalized = this.normalizeCreateInput(input);
    const payload = createServiceSchema.parse(normalized);
    const template = this.templates.get(payload.template_id);
    if (!template) throw new BadRequestException("Unknown template");
    const now = new Date().toISOString();
    const service: ServiceRecord = {
      id: crypto.randomUUID(),
      name: payload.name,
      template_id: payload.template_id,
      owner_user_id: payload.owner_user_id,
      status: "queued",
      power_state: "created",
      node_id: payload.node_id || "local",
      ports: template.ports.map((port, index) => ({
        key: port.key,
        host: port.default + index,
        container: port.default,
        protocol: port.protocol,
        host_ip: "0.0.0.0",
      })),
      mods: [],
      startup_variables: payload.startup_variables,
      network_mappings: [],
      created_at: now,
      updated_at: now,
    };
    await this.data.saveService(service);
    return service;
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
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    const runtimeId = await runtime.create({
      serviceId: service.id,
      name: service.name,
      image: template.install.image || "ghcr.io/aetherpanel/steamcmd:latest",
      environment: template.environment,
      ports: service.ports,
      volumeName: `aether_${service.id.replaceAll("-", "").slice(0, 12)}`,
      memoryMb: template.resources.recommended_ram_mb,
      dataPath: "/data",
      startupCommand: template.runtime.startup,
    });
    service.runtime_id = runtimeId;
    service.status = "active";
    service.power_state = "created";
    service.network_mappings = this.infrastructure.planForService(service.id).mappings;
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async power(id: string, action: "start" | "stop" | "restart" | "kill") {
    const service = this.get(id);
    if (!service.runtime_id) await this.provision(id);
    const runtimeId = this.get(id).runtime_id!;
    if (action === "start") await runtime.start(runtimeId);
    if (action === "stop") await runtime.stop(runtimeId);
    if (action === "restart") await runtime.restart(runtimeId);
    if (action === "kill") await runtime.kill(runtimeId);
    service.power_state = action === "stop" || action === "kill" ? "stopped" : "running";
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service;
  }

  async logs(id: string) {
    const service = this.get(id);
    return service.runtime_id ? runtime.logs(service.runtime_id) : "[panel] Service has not been provisioned yet.";
  }

  async stats(id: string) {
    const service = this.get(id);
    return service.runtime_id ? runtime.stats(service.runtime_id) : { running: false, cpu_percent: 0, memory_mb: 0, memory_limit_mb: 0 };
  }

  async command(id: string, command: string) {
    const service = this.get(id);
    if (!service.runtime_id) return { ok: false };
    return { ok: await runtime.sendCommand(service.runtime_id, command) };
  }
}
