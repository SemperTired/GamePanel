import { afterEach, describe, expect, it, vi } from "vitest";
import { PortProtocol } from "@aetherpanel/shared";
import { ServiceRecord } from "../data.module.js";
import { InfrastructureService } from "./infrastructure.service.js";

function store() {
  const data: any = {
    infrastructureConnectors: new Map(),
    services: new Map(),
    audits: [],
    saveInfrastructureConnector: async (connector: any) => data.infrastructureConnectors.set(connector.id, connector),
    saveService: async (service: any) => data.services.set(service.id, service),
    recordAudit: async (audit: any) => data.audits.push(audit),
  };
  return data;
}

function serviceRecord(protocol: PortProtocol = "both"): ServiceRecord {
  return {
    id: "svc-1",
    name: "Minecraft Public",
    template_id: "minecraft-java",
    owner_user_id: "usr_superadmin",
    status: "active",
    power_state: "created",
    ports: [{ key: "game", host: 30000, container: 25565, protocol, host_ip: "0.0.0.0" }],
    mods: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InfrastructureService", () => {
  it("records planned mappings without touching UniFiOS during dry run", async () => {
    const data = store();
    const service = serviceRecord();
    data.services.set(service.id, service);
    const infrastructure = new InfrastructureService(data);
    await infrastructure.create({
      name: "Dry Run UniFi",
      provider: "unifi_os",
      base_url: "https://unifi.local",
      username: "admin",
      password: "secret",
      internal_ip: "10.1.10.48",
      wan_ip: "75.122.94.89",
      dry_run: true,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await infrastructure.applyForService(service.id);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.result.dry_run).toBe(true);
    expect((service.network_mappings as any[])[0]).toMatchObject({ external_port: 30000, internal_ip: "10.1.10.48", applied: false });
  });

  it("creates idempotent UniFiOS port-forward rules for each exposed protocol", async () => {
    const data = store();
    const service = serviceRecord("both");
    data.services.set(service.id, service);
    const infrastructure = new InfrastructureService(data);
    await infrastructure.create({
      name: "Live UniFi",
      provider: "unifi_os",
      base_url: "https://unifi.local",
      username: "admin",
      password: "secret",
      internal_ip: "10.1.10.48",
      wan_ip: "75.122.94.89",
      dry_run: false,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
      headers: {
        get: (name: string) => name.toLowerCase() === "set-cookie" ? "TOKEN=abc; Path=/" : null,
        getSetCookie: () => ["TOKEN=abc; Path=/"],
      },
    } as any);

    const result = await infrastructure.applyForService(service.id);
    const sentBodies = fetchMock.mock.calls
      .map((call) => call[1] as RequestInit | undefined)
      .filter((init) => init?.method === "POST" && init.body)
      .map((init) => JSON.parse(String(init?.body)));

    expect(result.result.applied).toBe(true);
    expect(sentBodies.some((body) => body.proto === "tcp" && body.fwd_ip === "10.1.10.48")).toBe(true);
    expect(sentBodies.some((body) => body.proto === "udp" && body.fwd_ip === "10.1.10.48")).toBe(true);
  });
});
