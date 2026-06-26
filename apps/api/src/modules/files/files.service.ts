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

  private resolveServicePath(serviceId: string, requested = ".") {
    const safe = assertSafeRelativePath(requested || ".");
    const root = this.serviceRoot(serviceId);
    const target = path.resolve(root, safe);
    if (!target.startsWith(root)) throw new BadRequestException("Unsafe path");
    return { root, target, relative: safe };
  }

  async list(serviceId: string, requested = ".") {
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

  async read(serviceId: string, requested: string) {
    const { target, relative } = this.resolveServicePath(serviceId, requested);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat || !stat.isFile()) throw new NotFoundException("File not found");
    if (stat.size > Number(process.env.FILE_MANAGER_MAX_READ_BYTES || 1024 * 1024)) throw new BadRequestException("File is too large to edit in browser");
    return { path: relative, content: await fs.readFile(target, "utf8"), updated_at: stat.mtime.toISOString(), size: stat.size };
  }

  async write(serviceId: string, requested: string, content: string) {
    const { root, target, relative } = this.resolveServicePath(serviceId, requested);
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    const stat = await fs.stat(target);
    return { path: relative, size: stat.size, updated_at: stat.mtime.toISOString() };
  }

  async mkdir(serviceId: string, requested: string) {
    const { target, relative } = this.resolveServicePath(serviceId, requested);
    await fs.mkdir(target, { recursive: true });
    return { path: relative, type: "directory" };
  }
}
