import Docker from "dockerode";
import fs from "node:fs";
import path from "node:path";
import { RuntimeCreateInput, RuntimeProvider, RuntimeStats, RuntimeTarget } from "@aetherpanel/shared";

interface MockContainer {
  id: string;
  input: RuntimeCreateInput;
  state: "created" | "running" | "stopped";
  logs: string[];
}

export class DockerRuntimeProvider implements RuntimeProvider {
  private docker: Docker | null = null;
  private mock = new Map<string, MockContainer>();
  public readonly mode: "docker" | "mock";

  constructor(target: RuntimeTarget = {}) {
    if (process.env.AETHERPANEL_FORCE_MOCK_RUNTIME === "1") {
      this.mode = "mock";
      return;
    }
    try {
      this.docker = new Docker(dockerOptions(target.docker_host || process.env.DOCKER_HOST));
      this.mode = "docker";
    } catch {
      this.mode = "mock";
    }
  }

  async create(input: RuntimeCreateInput): Promise<string> {
    this.prepareHostPath(input);
    if (!this.docker || this.mode === "mock") {
      return this.createMock(input);
    }
    const ports = Object.fromEntries(input.ports.map((port) => [`${port.container}/${port.protocol === "both" ? "tcp" : port.protocol}`, [{ HostIp: port.host_ip, HostPort: String(port.host) }]]));
    const exposed = Object.fromEntries(Object.keys(ports).map((key) => [key, {}]));
    try {
      await this.ensureImage(input.image);
      const container = await this.docker.createContainer({
        name: `aether-${input.serviceId}`,
        Image: input.image,
        Env: this.environment(input),
        WorkingDir: input.dataPath,
        Cmd: input.startupCommand ? ["sh", "-lc", input.startupCommand] : undefined,
        ExposedPorts: exposed,
        HostConfig: {
          PortBindings: ports,
          Binds: [`${input.hostDataPath || input.volumeName}:${input.dataPath}`],
          Memory: input.memoryMb * 1024 * 1024,
          NanoCpus: input.cpuLimit ? Math.floor(input.cpuLimit * 1e9) : undefined,
          RestartPolicy: { Name: "unless-stopped" },
        },
        Tty: true,
        OpenStdin: true,
      });
      return container.id;
    } catch (error) {
      if (process.env.DOCKER_REQUIRED === "true" || process.env.NODE_ENV === "production") throw error;
      const id = this.createMock(input);
      this.mock.get(id)?.logs.push(`[panel] Docker unavailable, using mock runtime: ${error instanceof Error ? error.message : String(error)}`);
      return id;
    }
  }

  private prepareHostPath(input: RuntimeCreateInput) {
    if (!input.hostDataPath) return;
    fs.mkdirSync(input.hostDataPath, { recursive: true });
    if (input.installPlan) {
      fs.writeFileSync(path.join(input.hostDataPath, ".aetherpanel-install.json"), JSON.stringify(input.installPlan, null, 2));
      const commands = Array.isArray((input.installPlan as { commands?: unknown }).commands) ? (input.installPlan as { commands: string[] }).commands : [];
      fs.writeFileSync(path.join(input.hostDataPath, "install.aetherpanel.sh"), [`#!/usr/bin/env bash`, `set -euo pipefail`, `cd ${JSON.stringify(input.hostDataPath)}`, ...commands].join("\n") + "\n");
    }
  }

  private async ensureImage(image: string) {
    if (!this.docker) return;
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker?.modem.followProgress(stream, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }

  private createMock(input: RuntimeCreateInput): string {
    const id = `mock-${crypto.randomUUID()}`;
    this.mock.set(id, {
      id,
      input,
      state: "created",
      logs: [`[panel] Created ${input.name}`, `[panel] Image ${input.image}`, `[panel] Data ${input.hostDataPath || input.volumeName}`, `[panel] Ports ${input.ports.map((p) => `${p.host}/${p.protocol}`).join(", ")}`],
    });
    return id;
  }

  private environment(input: RuntimeCreateInput) {
    const variables: Record<string, string> = {
      service_id: input.serviceId,
      service_name: input.name,
      memory_mb: String(input.memoryMb),
      data_path: input.dataPath,
    };
    for (const port of input.ports) {
      variables[`${port.key}_port`] = String(port.host);
      variables[`${port.key}_container_port`] = String(port.container);
    }
    const render = (value: string) => value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => variables[key] ?? match);
    return Object.entries(input.environment).map(([key, value]) => `${key}=${render(String(value))}`);
  }

  async start(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "running";
      mock.logs.push("[panel] Server started");
      return;
    }
    const container = this.docker?.getContainer(runtimeId);
    const inspected = await container?.inspect().catch(() => null);
    if (inspected?.State?.Running) return;
    await container?.start();
  }

  async stop(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "stopped";
      mock.logs.push("[panel] Server stopped");
      return;
    }
    const container = this.docker?.getContainer(runtimeId);
    const inspected = await container?.inspect().catch(() => null);
    if (!inspected?.State?.Running) return;
    await container?.stop({ t: 15 });
  }

  async restart(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "running";
      mock.logs.push("[panel] Server restarted");
      return;
    }
    const container = this.docker?.getContainer(runtimeId);
    const inspected = await container?.inspect().catch(() => null);
    if (inspected?.State?.Running) await container?.restart({ t: 15 });
    else await container?.start();
  }

  async kill(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "stopped";
      mock.logs.push("[panel] Server killed");
      return;
    }
    const container = this.docker?.getContainer(runtimeId);
    const inspected = await container?.inspect().catch(() => null);
    if (!inspected?.State?.Running) return;
    await container?.kill();
  }

  async delete(runtimeId: string): Promise<void> {
    if (this.mock.delete(runtimeId)) return;
    await this.docker?.getContainer(runtimeId).remove({ force: true, v: false });
  }

  async logs(runtimeId: string, lines = 200): Promise<string> {
    const mock = this.mock.get(runtimeId);
    if (mock) return mock.logs.slice(-lines).join("\n");
    const stream = await this.docker?.getContainer(runtimeId).logs({ stdout: true, stderr: true, tail: lines });
    return Buffer.isBuffer(stream) ? stream.toString("utf8") : "";
  }

  async stats(runtimeId: string): Promise<RuntimeStats> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      return {
        running: mock.state === "running",
        cpu_percent: mock.state === "running" ? 8.4 : 0,
        memory_mb: mock.state === "running" ? Math.min(512, mock.input.memoryMb) : 0,
        memory_limit_mb: mock.input.memoryMb,
      };
    }
    const container = this.docker?.getContainer(runtimeId);
    if (!container) return { running: false, cpu_percent: 0, memory_mb: 0, memory_limit_mb: 0 };
    const inspected = await container.inspect();
    if (!inspected.State.Running) return { running: false, cpu_percent: 0, memory_mb: 0, memory_limit_mb: 0 };
    return { running: true, cpu_percent: 0, memory_mb: 0, memory_limit_mb: 0 };
  }

  async sendCommand(runtimeId: string, command: string): Promise<boolean> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.logs.push(`[console] > ${command}`);
      return mock.state === "running";
    }
    const exec = await this.docker?.getContainer(runtimeId).exec({ AttachStdin: true, AttachStdout: true, AttachStderr: true, Cmd: ["sh", "-lc", `printf '%s\\n' ${JSON.stringify(command)} > /proc/1/fd/0`] });
    await exec?.start({});
    return true;
  }

  async backup(runtimeId: string, destination: string): Promise<string> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.logs.push(`[backup] Snapshot written to ${destination}`);
      return destination;
    }
    return destination;
  }

  async restore(runtimeId: string, source: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) mock.logs.push(`[backup] Restored from ${source}`);
  }
}

export class AgentRuntimeProvider implements RuntimeProvider {
  constructor(private readonly target: RuntimeTarget) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.target.agent_url) throw new Error("agent_url is required for agent runtime");
    const response = await fetch(`${this.target.agent_url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.target.agent_token ? { Authorization: `Bearer ${this.target.agent_token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(body?.message || `Agent request failed ${response.status}`);
    return body as T;
  }

  async create(input: RuntimeCreateInput): Promise<string> {
    const result = await this.request<{ runtime_id: string }>("/runtime/create", { method: "POST", body: JSON.stringify(input) });
    return result.runtime_id;
  }

  async start(runtimeId: string): Promise<void> { await this.request(`/runtime/${runtimeId}/start`, { method: "POST" }); }
  async stop(runtimeId: string): Promise<void> { await this.request(`/runtime/${runtimeId}/stop`, { method: "POST" }); }
  async restart(runtimeId: string): Promise<void> { await this.request(`/runtime/${runtimeId}/restart`, { method: "POST" }); }
  async kill(runtimeId: string): Promise<void> { await this.request(`/runtime/${runtimeId}/kill`, { method: "POST" }); }
  async delete(runtimeId: string): Promise<void> { await this.request(`/runtime/${runtimeId}`, { method: "DELETE" }); }
  async logs(runtimeId: string, lines = 200): Promise<string> {
    const result = await this.request<{ logs: string }>(`/runtime/${runtimeId}/logs?lines=${lines}`);
    return result.logs;
  }
  async stats(runtimeId: string): Promise<RuntimeStats> { return this.request<RuntimeStats>(`/runtime/${runtimeId}/stats`); }
  async sendCommand(runtimeId: string, command: string): Promise<boolean> {
    const result = await this.request<{ ok: boolean }>(`/runtime/${runtimeId}/command`, { method: "POST", body: JSON.stringify({ command }) });
    return result.ok;
  }
  async backup(runtimeId: string, destination: string): Promise<string> {
    const result = await this.request<{ destination: string }>(`/runtime/${runtimeId}/backup`, { method: "POST", body: JSON.stringify({ destination }) });
    return result.destination;
  }
  async restore(runtimeId: string, source: string): Promise<void> { await this.request(`/runtime/${runtimeId}/restore`, { method: "POST", body: JSON.stringify({ source }) }); }
}

function dockerOptions(dockerHost?: string): Docker.DockerOptions {
  if (!dockerHost) return {};
  if (dockerHost.startsWith("unix://")) return { socketPath: dockerHost.replace("unix://", "") };
  if (dockerHost.startsWith("npipe://")) return { socketPath: dockerHost };
  const parsed = new URL(dockerHost);
  return {
    protocol: parsed.protocol.replace(":", "") as "http" | "https",
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 2376 : 2375,
  };
}

export function createDockerRuntime(target: RuntimeTarget = {}): RuntimeProvider {
  if (target.mode === "agent" || target.agent_url) return new AgentRuntimeProvider(target);
  return new DockerRuntimeProvider(target);
}
