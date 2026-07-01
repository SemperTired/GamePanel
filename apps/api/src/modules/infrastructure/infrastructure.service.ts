import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DataStore, ServiceRecord } from "../data.module.js";

const execFileAsync = promisify(execFile);

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
    if (!this.unifiSshPassword(connector)) {
      return { ok: false, provider: connector.provider, mode: "ssh", message: "UniFiOS SSH password is required." };
    }
    if (connector.dry_run) return { ok: true, provider: "unifi_os", dry_run: true, message: "Dry-run connector is configured. Toggle live apply to validate UniFiOS writes." };

    try {
      await this.sshCommand(connector, "true");
      return { ok: true, provider: "unifi_os", mode: "ssh", message: "UniFiOS SSH connection succeeded. Port automation is locked to SSH mode." };
    } catch (error) {
      return {
        ok: false,
        provider: "unifi_os",
        mode: "ssh",
        message: `UniFiOS SSH connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
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
      ? connector.dry_run
        ? {
          applied: false,
          dry_run: true,
          mode: "ssh",
          message: "Dry run only. SSH port-forward commands were generated but not executed.",
          mappings: mappings.map((mapping) => ({ ...mapping, applied: false })),
        }
        : await this.applyUnifiSshPortForwards(connector, service, mappings)
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

    this.allowLocalUnifiCertificate(baseUrl);
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
    if (!response?.ok) throw new BadRequestException(`UniFiOS login failed with ${lastError || "no response"}`);
    const setCookie = response.headers.getSetCookie?.() || this.splitSetCookie(response.headers.get("set-cookie"));
    session.cookie = setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
    session.csrfToken = response.headers.get("x-csrf-token") || response.headers.get("x-csrf-token".toLowerCase()) || undefined;
    return session;
  }

  private allowLocalUnifiCertificate(baseUrl: string) {
    if (/^https:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(baseUrl) && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
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

    let session: UnifiSession | null = null;
    let existing: UnifiRule[] = [];
    try {
      session = await this.unifiSession(connector);
      existing = await this.unifiListPortForwards(connector, session);
    } catch (error) {
      return this.applyUnifiSshPortForwards(connector, service, mappings, error);
    }
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

  private async applyUnifiSshPortForwards(connector: any, service: ServiceRecord, mappings: NetworkMapping[], apiError?: unknown) {
    const failures: string[] = [];
    const results: Array<{ name: string; action: "created" | "updated"; rule_id?: string }> = [];
    for (const mapping of mappings) {
      const errors: string[] = [];
      const protocols = mapping.protocol === "both" ? ["tcp", "udp"] : [mapping.protocol || "tcp"];
      for (const protocol of protocols) {
        const comment = this.shellSafe(`aetherpanel-${service.id}-${mapping.external_port}-${protocol}`);
        const wanInterface = this.shellSafe(this.normalizeSshWanInterface(connector.ssh_wan_interface || connector.wan_interface || "eth8"));
        const lanCidrs = this.sshLanCidrs(connector);
        const wanIp = this.shellSafe(mapping.wan_ip || connector.wan_ip || "");
        const internalIp = this.shellSafe(mapping.internal_ip);
        const externalPort = Number(mapping.external_port);
        const internalPort = Number(mapping.internal_port);
        const proto = this.shellSafe(protocol);
        const ruleCommands = [
          `iptables -t nat -C PREROUTING -i ${wanInterface} -p ${proto} --dport ${externalPort} -m comment --comment ${comment} -j DNAT --to-destination ${internalIp}:${internalPort} 2>/dev/null || iptables -t nat -I PREROUTING 1 -i ${wanInterface} -p ${proto} --dport ${externalPort} -m comment --comment ${comment} -j DNAT --to-destination ${internalIp}:${internalPort}`,
          `iptables -C FORWARD -p ${proto} -d ${internalIp} --dport ${internalPort} -m comment --comment ${comment} -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -p ${proto} -d ${internalIp} --dport ${internalPort} -m comment --comment ${comment} -j ACCEPT`,
          ...lanCidrs.flatMap((lanCidr) => {
            const safeLanCidr = this.shellSafe(lanCidr);
            return [
              `iptables -t nat -C PREROUTING -s ${safeLanCidr} -d ${wanIp} -p ${proto} --dport ${externalPort} -m comment --comment ${comment}-hairpin-dnat-${this.shellSafe(this.safeRuleSegment(lanCidr))} -j DNAT --to-destination ${internalIp}:${internalPort} 2>/dev/null || iptables -t nat -I PREROUTING 1 -s ${safeLanCidr} -d ${wanIp} -p ${proto} --dport ${externalPort} -m comment --comment ${comment}-hairpin-dnat-${this.shellSafe(this.safeRuleSegment(lanCidr))} -j DNAT --to-destination ${internalIp}:${internalPort}`,
              `iptables -t nat -C POSTROUTING -s ${safeLanCidr} -d ${internalIp} -p ${proto} --dport ${internalPort} -m comment --comment ${comment}-hairpin-snat-${this.shellSafe(this.safeRuleSegment(lanCidr))} -j MASQUERADE 2>/dev/null || iptables -t nat -I POSTROUTING 1 -s ${safeLanCidr} -d ${internalIp} -p ${proto} --dport ${internalPort} -m comment --comment ${comment}-hairpin-snat-${this.shellSafe(this.safeRuleSegment(lanCidr))} -j MASQUERADE`,
            ];
          }),
        ];
        const script = this.withPersistentUnifiBootRules(ruleCommands, `aetherpanel-${service.id}-${mapping.external_port}-${protocol}`);
        try {
          await this.sshCommand(connector, script);
          results.push({ name: mapping.name, action: "created", rule_id: `${externalPort}/${protocol}` });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(message);
          failures.push(`${mapping.name}: ${message}`);
        }
      }
      mapping.applied = errors.length === 0;
      mapping.rule_ids = errors.length ? [] : results.map((result) => result.rule_id).filter(Boolean) as string[];
      mapping.error = errors.join(" | ") || undefined;
    }
    return {
      applied: failures.length === 0,
      dry_run: false,
      mode: "ssh",
      message: failures.length
        ? `UniFiOS SSH automation applied ${results.length} rules with ${failures.length} failures.`
        : `UniFiOS SSH automation applied ${results.length} rules for ${service.name}.`,
      api_error: apiError instanceof Error ? apiError.message : apiError ? String(apiError) : undefined,
      service_id: service.id,
      mappings,
      results,
      failures,
    };
  }

  private async sshCommand(connector: any, command: string) {
    const host = connector.ssh_host || connector.gateway_host || this.hostnameFromUrl(connector.base_url) || "192.168.1.1";
    const username = connector.ssh_username || connector.username || "root";
    const password = this.unifiSshPassword(connector);
    if (!password) throw new BadRequestException("UniFiOS SSH password is required for SSH port automation.");
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

  private unifiSshPassword(connector: any) {
    return connector.ssh_password || connector.password;
  }

  private hostnameFromUrl(value: string) {
    try {
      return value ? new URL(value).hostname : "";
    } catch {
      return "";
    }
  }

  private shellSafe(value: string) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
  }

  private normalizeSshWanInterface(value: string) {
    return !value || value === "wan" ? "eth8" : value;
  }

  private sshLanCidrs(connector: any): string[] {
    const configured: string[] = Array.isArray(connector.lan_cidrs)
      ? connector.lan_cidrs.map((value: unknown) => String(value))
      : String(connector.lan_cidr || "").split(",");
    const cidrs = configured.map((value) => value.trim()).filter(Boolean);
    return [...new Set(cidrs.length ? cidrs : ["10.1.10.0/24", "192.168.1.0/24"])];
  }

  private safeRuleSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "lan";
  }

  private withPersistentUnifiBootRules(commands: string[], marker: string) {
    const file = "/data/on_boot.d/aetherpanel-port-forwards.sh";
    const body = commands.join("\n");
    return [
      "mkdir -p /data/on_boot.d",
      `[ -s ${file} ] || printf '#!/bin/sh\\n' > ${file}`,
      `chmod +x ${file}`,
      commands.join(" && "),
      `grep -F ${this.shellSafe(marker)} ${file} >/dev/null 2>&1 || cat >> ${file} <<'AETHERPANEL_RULE'\n${body}\nAETHERPANEL_RULE`,
    ].join(" && ");
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
