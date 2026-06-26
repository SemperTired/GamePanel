import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DataStore, ServiceRecord } from "../data.module.js";

type ConnectorInput = {
  name: string;
  provider: "unifi_os" | "upnp" | "manual";
  base_url?: string;
  site_id?: string;
  username?: string;
  password?: string;
  gateway_ip?: string;
  wan_ip?: string;
  enabled?: boolean;
  dry_run?: boolean;
};

@Injectable()
export class InfrastructureService {
  constructor(private readonly data: DataStore) {}

  list() {
    return [...this.data.infrastructureConnectors.values()].map((connector: any) => this.safeConnector(connector));
  }

  async create(input: ConnectorInput) {
    if (!input.name || !input.provider) throw new BadRequestException("name and provider are required");
    const now = new Date().toISOString();
    const connector = {
      id: crypto.randomUUID(),
      name: input.name,
      provider: input.provider,
      base_url: input.base_url,
      site_id: input.site_id || "default",
      username: input.username,
      password: input.password,
      gateway_ip: input.gateway_ip,
      wan_ip: input.wan_ip,
      enabled: input.enabled ?? true,
      dry_run: input.dry_run ?? true,
      created_at: now,
      updated_at: now,
    };
    await this.data.saveInfrastructureConnector(connector);
    return this.safeConnector(connector);
  }

  async test(id: string) {
    const connector = this.getRaw(id);
    if (connector.provider === "manual") return { ok: true, provider: "manual", message: "Manual connector requires no API access." };
    if (connector.provider === "upnp") return { ok: false, provider: "upnp", message: "UPnP discovery is not enabled in this Node runtime yet. Use UniFiOS API or manual mappings." };
    if (!connector.base_url || !connector.username || !connector.password) {
      return { ok: false, provider: connector.provider, message: "UniFiOS base_url, username, and password are required." };
    }
    if (connector.dry_run) return { ok: true, provider: "unifi_os", dry_run: true, message: "Dry-run connector is configured. No UniFiOS login attempted." };
    const login = await this.unifiLogin(connector);
    return { ok: login.ok, provider: "unifi_os", message: login.message };
  }

  planForService(serviceId: string, connectorId?: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const connector = connectorId ? this.getRaw(connectorId) : this.firstEnabledConnector();
    return {
      service_id: service.id,
      connector: connector ? this.safeConnector(connector) : null,
      mappings: this.buildMappings(service, connector),
    };
  }

  async applyForService(serviceId: string, connectorId?: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const connector = connectorId ? this.getRaw(connectorId) : this.firstEnabledConnector();
    if (!connector) throw new BadRequestException("No infrastructure connector is configured");
    const mappings = this.buildMappings(service, connector);
    const result = connector.provider === "unifi_os"
      ? await this.applyUnifiPortForwards(connector, service, mappings)
      : { applied: false, dry_run: true, message: `${connector.provider} connector recorded mappings only.` };
    service.network_mappings = mappings;
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    await this.data.recordAudit({
      id: crypto.randomUUID(),
      actor: "infrastructure",
      action: "network.port_forward.apply",
      target: service.id,
      metadata: { connector_id: connector.id, result },
      created_at: new Date().toISOString(),
    });
    return { service_id: service.id, connector: this.safeConnector(connector), mappings, result };
  }

  private getRaw(id: string): any {
    const connector = this.data.infrastructureConnectors.get(id) as any;
    if (!connector) throw new NotFoundException("Infrastructure connector not found");
    return connector;
  }

  private firstEnabledConnector(): any | null {
    return [...this.data.infrastructureConnectors.values()].find((connector: any) => connector.enabled) || null;
  }

  private safeConnector(connector: any) {
    const { password: _password, ...safe } = connector;
    return { ...safe, has_password: Boolean(connector.password) };
  }

  private buildMappings(service: ServiceRecord, connector?: any) {
    return service.ports.map((port) => ({
      id: `${service.id}-${port.key}-${port.host}-${port.protocol}`,
      name: `AetherPanel ${service.name} ${port.key}`,
      protocol: port.protocol,
      external_port: port.host,
      internal_port: port.host,
      internal_ip: connector?.gateway_ip || port.host_ip || "127.0.0.1",
      wan_ip: connector?.wan_ip || process.env.AETHERNODE_WAN_IP || "",
      enabled: true,
    }));
  }

  private async unifiLogin(connector: any) {
    try {
      const response = await fetch(`${String(connector.base_url).replace(/\/$/, "")}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: connector.username, password: connector.password }),
      });
      return { ok: response.ok, message: response.ok ? "UniFiOS login succeeded." : `UniFiOS login failed with HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async applyUnifiPortForwards(connector: any, service: ServiceRecord, mappings: any[]) {
    if (connector.dry_run) return { applied: false, dry_run: true, message: "Dry run only. Port-forward payloads were generated but not sent." };
    const login = await this.unifiLogin(connector);
    if (!login.ok) return { applied: false, dry_run: false, message: login.message };
    return {
      applied: false,
      dry_run: false,
      message: "UniFiOS login succeeded. Port-forward write endpoint must be enabled for the target console/site before live writes are sent.",
      service_id: service.id,
      generated: mappings.length,
    };
  }
}
