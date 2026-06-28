import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DataStore, ServiceRecord } from "../data.module.js";

type ConnectorProvider = "unifi_os" | "upnp" | "manual";

type ConnectorInput = {
  name: string;
  provider: ConnectorProvider;
  base_url?: string;
  site_id?: string;
  username?: string;
  password?: string;
  api_key?: string;
  gateway_ip?: string;
  internal_ip?: string;
  wan_ip?: string;
  wan_interface?: string;
  source_ip?: string;
  enabled?: boolean;
  dry_run?: boolean;
};

type NetworkMapping = {
  id: string;
  name: string;
  protocol: string;
  external_port: number;
  internal_port: number;
  internal_ip: string;
  wan_ip: string;
  enabled: boolean;
  applied?: boolean;
  rule_ids?: string[];
  error?: string;
};

type UnifiSession = {
  baseUrl: string;
  siteId: string;
  cookie?: string;
  csrfToken?: string;
  apiKey?: string;
};

type UnifiRule = {
  _id?: string;
  id?: string;
  name?: string;
  enabled?: boolean;
  proto?: string;
  protocol?: string;
  dst_port?: string | number;
  fwd_port?: string | number;
  fwd_ip?: string;
  src?: string;
  log?: boolean;
  wan_interface?: string;
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
      api_key: input.api_key,
      gateway_ip: input.internal_ip || input.gateway_ip,
      internal_ip: input.internal_ip || input.gateway_ip,
      wan_ip: input.wan_ip,
      wan_interface: input.wan_interface || "wan",
      source_ip: input.source_ip || "any",
      enabled: input.enabled ?? true,
      dry_run: input.dry_run ?? process.env.NETWORK_APPLY_MODE !== "live",
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
    if (!connector.base_url) return { ok: false, provider: connector.provider, message: "UniFiOS base URL is required." };
    if (!connector.api_key && (!connector.username || !connector.password)) {
      return { ok: false, provider: connector.provider, message: "UniFiOS username/password or API key is required." };
    }
    if (connector.dry_run) return { ok: true, provider: "unifi_os", dry_run: true, message: "Dry-run connector is configured. Toggle live apply to validate UniFiOS writes." };

    const session = await this.unifiSession(connector);
    const rules = await this.unifiListPortForwards(connector, session);
    return { ok: true, provider: "unifi_os", message: `UniFiOS connection succeeded. ${rules.length} port-forward rules visible.`, rules: rules.length };
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
      : { applied: false, dry_run: true, message: `${connector.provider} connector recorded mappings only.`, mappings };

    service.network_mappings = result.mappings || mappings;
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
    return { service_id: service.id, connector: this.safeConnector(connector), mappings: service.network_mappings, result };
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
    const { password: _password, api_key: _apiKey, ...safe } = connector;
    return { ...safe, has_password: Boolean(connector.password), has_api_key: Boolean(connector.api_key) };
  }

  private buildMappings(service: ServiceRecord, connector?: any): NetworkMapping[] {
    const internalIp = connector?.internal_ip || connector?.gateway_ip || process.env.NODE_LAN_IP || "127.0.0.1";
    return service.ports.map((port) => ({
      id: `${service.id}-${port.key}-${port.host}-${port.protocol}`,
      name: this.ruleBaseName(service, port.key),
      protocol: port.protocol,
      external_port: port.host,
      internal_port: port.host,
      internal_ip: internalIp || port.host_ip || "127.0.0.1",
      wan_ip: connector?.wan_ip || process.env.AETHERNODE_WAN_IP || "",
      enabled: true,
    }));
  }

  private async unifiSession(connector: any): Promise<UnifiSession> {
    const baseUrl = String(connector.base_url || "").replace(/\/$/, "");
    const session: UnifiSession = {
      baseUrl,
      siteId: connector.site_id || "default",
      apiKey: connector.api_key,
    };
    if (connector.api_key) return session;

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: connector.username, password: connector.password }),
    });
    if (!response.ok) throw new BadRequestException(`UniFiOS login failed with HTTP ${response.status}`);
    const setCookie = response.headers.getSetCookie?.() || this.splitSetCookie(response.headers.get("set-cookie"));
    session.cookie = setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
    session.csrfToken = response.headers.get("x-csrf-token") || response.headers.get("x-csrf-token".toLowerCase()) || undefined;
    return session;
  }

  private async applyUnifiPortForwards(connector: any, service: ServiceRecord, mappings: NetworkMapping[]) {
    if (connector.dry_run) {
      return {
        applied: false,
        dry_run: true,
        message: "Dry run only. Port-forward payloads were generated but not sent.",
        mappings: mappings.map((mapping) => ({ ...mapping, applied: false })),
      };
    }

    const session = await this.unifiSession(connector);
    const existing = await this.unifiListPortForwards(connector, session);
    const appliedMappings: NetworkMapping[] = [];
    const failures: string[] = [];
    const results: Array<{ name: string; action: "created" | "updated"; rule_id?: string }> = [];

    for (const mapping of mappings) {
      const ruleResults: string[] = [];
      const errors: string[] = [];
      for (const rule of this.toUnifiRules(connector, mapping)) {
        try {
          const match = this.findExistingRule(existing, rule);
          const saved = match
            ? await this.unifiWritePortForward(connector, session, { ...match, ...rule }, match)
            : await this.unifiWritePortForward(connector, session, rule);
          const ruleId = this.ruleId(saved);
          if (ruleId) ruleResults.push(ruleId);
          results.push({ name: rule.name || mapping.name, action: match ? "updated" : "created", rule_id: ruleId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${rule.name || mapping.name}: ${message}`);
          failures.push(`${mapping.name}: ${message}`);
        }
      }
      appliedMappings.push({ ...mapping, applied: errors.length === 0, rule_ids: ruleResults, error: errors.join(" | ") || undefined });
    }

    return {
      applied: failures.length === 0,
      dry_run: false,
      message: failures.length
        ? `UniFiOS applied ${results.length} rule changes with ${failures.length} failures.`
        : `UniFiOS port-forward automation applied ${results.length} rule changes for ${service.name}.`,
      service_id: service.id,
      mappings: appliedMappings,
      results,
      failures,
    };
  }

  private async unifiListPortForwards(connector: any, session: UnifiSession): Promise<UnifiRule[]> {
    const response = await this.unifiRequest(connector, session, "GET", this.portForwardPath(session.siteId));
    return Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  }

  private async unifiWritePortForward(connector: any, session: UnifiSession, rule: UnifiRule, existing?: UnifiRule): Promise<UnifiRule> {
    const id = existing ? this.ruleId(existing) : undefined;
    const path = id ? `${this.portForwardPath(session.siteId)}/${id}` : this.portForwardPath(session.siteId);
    const response = await this.unifiRequest(connector, session, id ? "PUT" : "POST", path, rule);
    return response?.data?.[0] || response?.data || response || rule;
  }

  private async unifiRequest(connector: any, session: UnifiSession, method: string, path: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (session.cookie) headers.Cookie = session.cookie;
    if (session.csrfToken) headers["X-CSRF-Token"] = session.csrfToken;
    if (session.apiKey) headers["X-API-KEY"] = session.apiKey;

    const paths = [path, path.replace("/proxy/network", "")];
    let lastError = "";
    for (const candidate of paths) {
      const response = await fetch(`${session.baseUrl}${candidate}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 404 && candidate !== paths[paths.length - 1]) continue;
      const text = await response.text();
      const payload = text ? this.parseJson(text) : {};
      if (response.ok) return payload;
      lastError = `HTTP ${response.status}${text ? `: ${text.slice(0, 220)}` : ""}`;
      if (response.status !== 404) break;
    }
    throw new BadRequestException(`UniFiOS ${method} ${path} failed: ${lastError}`);
  }

  private portForwardPath(siteId: string) {
    return `/proxy/network/api/s/${encodeURIComponent(siteId)}/rest/portforward`;
  }

  private toUnifiRules(connector: any, mapping: NetworkMapping): UnifiRule[] {
    const protocols = mapping.protocol === "both" ? ["tcp", "udp"] : [mapping.protocol || "tcp"];
    return protocols.map((protocol) => ({
      name: this.withProtocolSuffix(mapping.name, protocol),
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

  private findExistingRule(existing: UnifiRule[], rule: UnifiRule) {
    return existing.find((candidate) => candidate.name === rule.name)
      || existing.find((candidate) =>
        String(candidate.dst_port) === String(rule.dst_port)
        && String(candidate.fwd_port) === String(rule.fwd_port)
        && candidate.fwd_ip === rule.fwd_ip
        && String(candidate.proto || candidate.protocol || "").toLowerCase() === String(rule.proto).toLowerCase());
  }

  private ruleId(rule: UnifiRule) {
    return rule._id || rule.id;
  }

  private ruleBaseName(service: ServiceRecord, portKey: string) {
    const raw = `AetherPanel ${service.name} ${portKey}`.replace(/[^a-zA-Z0-9 .:_-]/g, " ").replace(/\s+/g, " ").trim();
    return raw.slice(0, 55);
  }

  private withProtocolSuffix(name: string, protocol: string) {
    return `${name} ${protocol.toUpperCase()}`.slice(0, 63);
  }

  private splitSetCookie(value: string | null) {
    if (!value) return [];
    return value.split(/,(?=\s*[^;,\s]+=)/g);
  }

  private parseJson(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
