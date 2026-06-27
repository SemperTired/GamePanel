import fs from "node:fs/promises";
import path from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { assertSafeRelativePath } from "@aetherpanel/shared";
import { DataStore } from "../data.module.js";

const dataRoot = () => path.resolve(process.env.AETHERPANEL_DATA_ROOT || path.join(process.cwd(), "var", "services"));

@Injectable()
export class FilesService {
  constructor(private readonly data: DataStore) {}

  private serviceRoot(serviceId: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    return path.join(dataRoot(), serviceId);
  }

  private service(serviceId: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  private agentForService(serviceId: string) {
    const service = this.service(serviceId);
    const node = (service.node_id ? this.data.nodes.get(service.node_id) : null) as Record<string, unknown> | null;
    const agentUrl = String(node?.agent_url || "");
    if (!agentUrl) return null;
    return {
      url: agentUrl.replace(/\/$/, ""),
      token: String(node?.agent_token || process.env.AETHERPANEL_AGENT_TOKEN || ""),
    };
  }

  private async agentRequest<T>(serviceId: string, route: string, init: RequestInit = {}): Promise<T> {
    const agent = this.agentForService(serviceId);
    if (!agent) throw new NotFoundException("Agent not configured for service");
    const response = await fetch(`${agent.url}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(agent.token ? { Authorization: `Bearer ${agent.token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundException(body?.message || "File not found");
      throw new BadRequestException(body?.message || `Agent file request failed ${response.status}`);
    }
    return body as T;
  }

  private resolveServicePath(serviceId: string, requested = ".") {
    const safe = assertSafeRelativePath(requested || ".");
    const root = this.serviceRoot(serviceId);
    const target = path.resolve(root, safe);
    if (!target.startsWith(root)) throw new BadRequestException("Unsafe path");
    return { root, target, relative: safe };
  }

  async list(serviceId: string, requested = ".") {
    if (this.agentForService(serviceId)) return this.agentRequest(serviceId, `/files/${serviceId}?path=${encodeURIComponent(requested)}`);
    const { root, target } = this.resolveServicePath(serviceId, requested);
    await fs.mkdir(root, { recursive: true });
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) return [];
    if (!stat.isDirectory()) throw new BadRequestException("Path is not a directory");
    const entries = await fs.readdir(target, { withFileTypes: true });
    return Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(target, entry.name);
      const entryStat = await fs.stat(entryPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: entryStat.size,
        updated_at: entryStat.mtime.toISOString(),
      };
    }));
  }

  async read(serviceId: string, requested: string, options: { create?: boolean; type?: string; template?: string } = {}) {
    const fallback = this.defaultContent(requested, options.type, options.template);
    if (this.agentForService(serviceId)) {
      const query = new URLSearchParams({ path: requested || "" });
      if (options.create) query.set("create", "true");
      if (fallback) query.set("fallback", fallback);
      return this.agentRequest(serviceId, `/files/${serviceId}/content?${query.toString()}`);
    }
    const { target, relative } = this.resolveServicePath(serviceId, requested);
    let stat = await fs.stat(target).catch(() => null);
    if (!stat && options.create) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, fallback, "utf8");
      stat = await fs.stat(target);
    }
    if (!stat || !stat.isFile()) throw new NotFoundException("File not found");
    if (stat.size > Number(process.env.FILE_MANAGER_MAX_READ_BYTES || 1024 * 1024)) throw new BadRequestException("File is too large to edit in browser");
    return { path: relative, content: await fs.readFile(target, "utf8"), updated_at: stat.mtime.toISOString(), size: stat.size };
  }

  async write(serviceId: string, requested: string, content: string) {
    if (this.agentForService(serviceId)) return this.agentRequest(serviceId, `/files/${serviceId}/content`, { method: "PUT", body: JSON.stringify({ path: requested, content }) });
    const { root, target, relative } = this.resolveServicePath(serviceId, requested);
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    const stat = await fs.stat(target);
    return { path: relative, size: stat.size, updated_at: stat.mtime.toISOString() };
  }

  async mkdir(serviceId: string, requested: string) {
    if (this.agentForService(serviceId)) return this.agentRequest(serviceId, `/files/${serviceId}/mkdir`, { method: "POST", body: JSON.stringify({ path: requested }) });
    const { target, relative } = this.resolveServicePath(serviceId, requested);
    await fs.mkdir(target, { recursive: true });
    return { path: relative, type: "directory" };
  }

  private defaultContent(requested: string, type = "text", template?: string) {
    if (template) return template;
    const name = requested.split(/[\\/]/).pop() || "server.cfg";
    if (type === "json") return "{\n  \"name\": \"AetherPanel Server\"\n}\n";
    if (type === "yaml") return "name: AetherPanel Server\n";
    if (type === "toml") return "name = \"AetherPanel Server\"\n";
    if (type === "xml") return "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<configuration />\n";
    if (type === "properties") return "server-name=AetherPanel Server\n";
    if (type === "ini") return "[server]\nname=AetherPanel Server\n";
    return `# ${name}\n# Managed by AetherPanel. Edit values below and restart the service when required.\n`;
  }
}
