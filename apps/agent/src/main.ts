import "dotenv/config";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import Docker from "dockerode";
import { createDockerRuntime } from "@aetherpanel/runtime-docker";
import { assertSafeRelativePath, RuntimeCreateInput } from "@aetherpanel/shared";
import { prepareServiceFiles } from "@aetherpanel/templates";

const port = Number(process.env.AGENT_PORT || 4210);
const token = process.env.AETHERPANEL_AGENT_TOKEN || "";
const runtime = createDockerRuntime({ mode: "local", docker_host: process.env.DOCKER_HOST || "unix:///var/run/docker.sock" });
const docker = new Docker(dockerOptions(process.env.DOCKER_HOST || "unix:///var/run/docker.sock"));
const dataRoot = () => path.resolve(process.env.AETHERPANEL_DATA_ROOT || "/srv/aetherpanel/services");
const backupRoot = () => path.resolve(process.env.AETHERPANEL_BACKUP_ROOT || "/srv/aetherpanel/backups");
const execFile = promisify(execFileCallback);

function dockerOptions(host?: string) {
  if (!host || host.startsWith("unix://")) return { socketPath: host?.replace("unix://", "") || "/var/run/docker.sock" };
  if (host.startsWith("tcp://")) {
    const parsed = new URL(host);
    return { host: parsed.hostname, port: Number(parsed.port || 2375), protocol: "http" as const };
  }
  return { socketPath: "/var/run/docker.sock" };
}

async function readJson(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function send(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: http.IncomingMessage) {
  if (!token) return process.env.NODE_ENV !== "production";
  return request.headers.authorization === `Bearer ${token}`;
}

function resolveServicePath(serviceId: string, requested = ".") {
  const safe = assertSafeRelativePath(requested || ".");
  const root = path.join(dataRoot(), serviceId);
  const target = path.resolve(root, safe);
  if (!target.startsWith(root)) throw new Error("Unsafe path");
  return { root, target, relative: safe };
}

async function listFiles(serviceId: string, requested = ".") {
  const { root, target } = resolveServicePath(serviceId, requested);
  await fs.mkdir(root, { recursive: true });
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return [];
  if (!stat.isDirectory()) throw new Error("Path is not a directory");
  const entries = await fs.readdir(target, { withFileTypes: true });
  return Promise.all(entries.map(async (entry) => {
    const entryStat = await fs.stat(path.join(target, entry.name));
    return { name: entry.name, type: entry.isDirectory() ? "directory" : "file", size: entryStat.size, updated_at: entryStat.mtime.toISOString() };
  }));
}

async function readFile(serviceId: string, requested: string, create = false, fallback = "") {
  const { root, target, relative } = resolveServicePath(serviceId, requested);
  await fs.mkdir(root, { recursive: true });
  let stat = await fs.stat(target).catch(() => null);
  if (!stat && create) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, fallback, "utf8");
    stat = await fs.stat(target);
  }
  if (!stat || !stat.isFile()) throw new Error("File not found");
  if (stat.size > Number(process.env.FILE_MANAGER_MAX_READ_BYTES || 1024 * 1024)) throw new Error("File is too large to edit in browser");
  return { path: relative, content: await fs.readFile(target, "utf8"), updated_at: stat.mtime.toISOString(), size: stat.size };
}

async function writeFile(serviceId: string, requested: string, content: string) {
  const { root, target, relative } = resolveServicePath(serviceId, requested);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  const stat = await fs.stat(target);
  return { path: relative, size: stat.size, updated_at: stat.mtime.toISOString() };
}

async function listBackups(serviceId: string) {
  const root = path.join(backupRoot(), serviceId);
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const stat = await fs.stat(path.join(root, entry.name));
    return { name: entry.name, size: stat.size, created_at: stat.birthtime.toISOString(), updated_at: stat.mtime.toISOString() };
  }));
}

async function createBackup(serviceId: string) {
  const { root } = resolveServicePath(serviceId, ".");
  await fs.mkdir(root, { recursive: true });
  const targetDir = path.join(backupRoot(), serviceId);
  await fs.mkdir(targetDir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`;
  const target = path.join(targetDir, name);
  await execFile("tar", ["-czf", target, "-C", root, "."]);
  const stat = await fs.stat(target);
  return { name, path: target, size: stat.size, created_at: stat.birthtime.toISOString() };
}

async function restoreBackup(serviceId: string, name: string) {
  const safeName = assertSafeRelativePath(name);
  if (!safeName.endsWith(".tar.gz")) throw new Error("Only .tar.gz backups can be restored");
  const source = path.resolve(path.join(backupRoot(), serviceId), safeName);
  const backupDir = path.resolve(backupRoot(), serviceId);
  if (!source.startsWith(backupDir)) throw new Error("Unsafe backup path");
  await fs.stat(source);
  const { root } = resolveServicePath(serviceId, ".");
  const restoreMarker = path.join(root, ".aetherpanel-restore.json");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  await execFile("tar", ["-xzf", source, "-C", root]);
  await fs.writeFile(restoreMarker, JSON.stringify({ backup: safeName, restored_at: new Date().toISOString() }, null, 2));
  return { ok: true, name: safeName, restored_at: new Date().toISOString() };
}

function normalizeContainer(container: Docker.ContainerInfo) {
  const labels = container.Labels || {};
  const names = container.Names.map((name) => name.replace(/^\//, ""));
  const serviceId = names.find((name) => name.startsWith("aether-"))?.replace(/^aether-/, "") || labels["com.aetherpanel.service_id"] || "";
  return {
    id: container.Id,
    short_id: container.Id.slice(0, 12),
    names,
    image: container.Image,
    image_id: container.ImageID,
    command: container.Command,
    created_at: new Date(container.Created * 1000).toISOString(),
    state: container.State,
    status: container.Status,
    ports: container.Ports,
    labels,
    service_id: serviceId,
    aether_managed: names.some((name) => name.startsWith("aether-")) || Boolean(serviceId),
  };
}

async function listDocker() {
  const [containers, images, info] = await Promise.all([
    docker.listContainers({ all: true }),
    docker.listImages({ all: true }),
    docker.info().catch(() => null),
  ]);
  return {
    host: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
    containers: containers.map(normalizeContainer).sort((a, b) => Number(b.aether_managed) - Number(a.aether_managed) || a.names.join(",").localeCompare(b.names.join(","))),
    images: images.map((image) => ({
      id: image.Id,
      short_id: image.Id.replace(/^sha256:/, "").slice(0, 12),
      tags: image.RepoTags || [],
      size: image.Size,
      created_at: new Date(image.Created * 1000).toISOString(),
    })),
    info: info ? { containers: info.Containers, containers_running: info.ContainersRunning, images: info.Images, driver: info.Driver, server_version: info.ServerVersion } : null,
  };
}

async function removeDockerContainer(identifier: string, force: boolean) {
  if (!identifier || !/^[a-zA-Z0-9_.:-]+$/.test(identifier)) throw new Error("Invalid container id or name");
  const container = docker.getContainer(identifier);
  const inspected = await container.inspect();
  await container.remove({ force, v: false });
  return {
    ok: true,
    removed: inspected.Id,
    name: inspected.Name?.replace(/^\//, ""),
    state: inspected.State?.Status,
    force,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (!authorized(request)) return send(response, 401, { message: "Unauthorized" });
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, runtime: "docker", host: process.env.DOCKER_HOST || "unix:///var/run/docker.sock" });
    if (request.method === "GET" && url.pathname === "/docker") return send(response, 200, await listDocker());
    const dockerContainerMatch = url.pathname.match(/^\/docker\/containers\/([^/]+)$/);
    if (dockerContainerMatch && request.method === "DELETE") {
      const body = await readJson(request);
      if (body.confirm !== "REMOVE") return send(response, 400, { message: "Type REMOVE to confirm container removal" });
      return send(response, 200, await removeDockerContainer(decodeURIComponent(dockerContainerMatch[1]), body.force !== false));
    }
    const backupMatch = url.pathname.match(/^\/backups\/([^/]+)$/);
    if (backupMatch) {
      const [, serviceId] = backupMatch;
      if (request.method === "GET") return send(response, 200, await listBackups(serviceId));
      if (request.method === "POST") return send(response, 200, await createBackup(serviceId));
      if (request.method === "PUT") return send(response, 200, await restoreBackup(serviceId, (await readJson(request)).name || ""));
      return send(response, 404, { message: "Not found" });
    }
    const fileMatch = url.pathname.match(/^\/files\/([^/]+)(?:\/([^/]+))?$/);
    if (fileMatch) {
      const [, serviceId, action] = fileMatch;
      if (request.method === "GET" && !action) return send(response, 200, await listFiles(serviceId, url.searchParams.get("path") || "."));
      if (request.method === "GET" && action === "content") return send(response, 200, await readFile(serviceId, url.searchParams.get("path") || "", url.searchParams.get("create") === "true", url.searchParams.get("fallback") || ""));
      if (request.method === "PUT" && action === "content") {
        const body = await readJson(request);
        return send(response, 200, await writeFile(serviceId, body.path || "", body.content || ""));
      }
      if (request.method === "POST" && action === "mkdir") {
        const body = await readJson(request);
        const { target, relative } = resolveServicePath(serviceId, body.path || ".");
        await fs.mkdir(target, { recursive: true });
        return send(response, 200, { path: relative, type: "directory" });
      }
      if (request.method === "DELETE" && !action) {
        const { root } = resolveServicePath(serviceId, ".");
        await fs.rm(root, { recursive: true, force: true });
        return send(response, 200, { ok: true });
      }
      return send(response, 404, { message: "Not found" });
    }
    if (request.method === "POST" && url.pathname === "/runtime/create") {
      const input = await readJson(request) as RuntimeCreateInput;
      if (input.installPlan) {
        await prepareServiceFiles(input.installPlan as any, {
          runInstallers: process.env.AETHERPANEL_RUN_INSTALLERS === "true",
          variables: input.environment || {},
        });
      }
      const runtimeId = await runtime.create(input);
      return send(response, 200, { runtime_id: runtimeId });
    }
    const match = url.pathname.match(/^\/runtime\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return send(response, 404, { message: "Not found" });
    const [, runtimeId, action] = match;
    if (request.method === "DELETE") {
      await runtime.delete(runtimeId);
      return send(response, 200, { ok: true });
    }
    if (request.method === "GET" && action === "logs") return send(response, 200, { logs: await runtime.logs(runtimeId, Number(url.searchParams.get("lines") || 200)) });
    if (request.method === "GET" && action === "stats") return send(response, 200, await runtime.stats(runtimeId));
    if (request.method === "POST" && action === "start") await runtime.start(runtimeId);
    else if (request.method === "POST" && action === "stop") await runtime.stop(runtimeId);
    else if (request.method === "POST" && action === "restart") await runtime.restart(runtimeId);
    else if (request.method === "POST" && action === "kill") await runtime.kill(runtimeId);
    else if (request.method === "POST" && action === "command") return send(response, 200, { ok: await runtime.sendCommand(runtimeId, (await readJson(request)).command || "" ) });
    else if (request.method === "POST" && action === "backup") return send(response, 200, { destination: await runtime.backup(runtimeId, (await readJson(request)).destination || "") });
    else if (request.method === "POST" && action === "restore") {
      await runtime.restore(runtimeId, (await readJson(request)).source || "");
    } else return send(response, 404, { message: "Not found" });
    return send(response, 200, { ok: true });
  } catch (error) {
    return send(response, 500, { message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`AetherPanel agent listening on ${port}`));
