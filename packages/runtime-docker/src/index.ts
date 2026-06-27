import Docker from "dockerode";
import { RuntimeCreateInput, RuntimeProvider, RuntimeStats } from "@aetherpanel/shared";

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

  constructor() {
    if (process.env.AETHERPANEL_FORCE_MOCK_RUNTIME === "1") {
      this.mode = "mock";
      return;
    }
    try {
      this.docker = new Docker();
      this.mode = "docker";
    } catch {
      this.mode = "mock";
    }
  }

  async create(input: RuntimeCreateInput): Promise<string> {
    if (!this.docker || this.mode === "mock") {
      return this.createMock(input);
    }
    const ports = Object.fromEntries(input.ports.map((port) => [`${port.container}/${port.protocol === "both" ? "tcp" : port.protocol}`, [{ HostIp: port.host_ip, HostPort: String(port.host) }]]));
    const exposed = Object.fromEntries(Object.keys(ports).map((key) => [key, {}]));
    try {
      const container = await this.docker.createContainer({
        name: `aether-${input.serviceId}`,
        Image: input.image,
        Env: Object.entries(input.environment).map(([key, value]) => `${key}=${value}`),
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

  async start(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "running";
      mock.logs.push("[panel] Server started");
      return;
    }
    await this.docker?.getContainer(runtimeId).start();
  }

  async stop(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "stopped";
      mock.logs.push("[panel] Server stopped");
      return;
    }
    await this.docker?.getContainer(runtimeId).stop({ t: 15 });
  }

  async restart(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "running";
      mock.logs.push("[panel] Server restarted");
      return;
    }
    await this.docker?.getContainer(runtimeId).restart({ t: 15 });
  }

  async kill(runtimeId: string): Promise<void> {
    const mock = this.mock.get(runtimeId);
    if (mock) {
      mock.state = "stopped";
      mock.logs.push("[panel] Server killed");
      return;
    }
    await this.docker?.getContainer(runtimeId).kill();
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

export function createDockerRuntime(): DockerRuntimeProvider {
  return new DockerRuntimeProvider();
}
