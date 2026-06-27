import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { GameTemplate, ModEntry, gameTemplateSchema } from "@aetherpanel/shared";
export { additionalStarterTemplates } from "./starter-catalog.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const templateDirCandidates = [
  path.resolve(moduleDir, "../templates"),
  path.resolve(moduleDir, "../../templates"),
  path.resolve(process.cwd(), "packages/templates/templates"),
  path.resolve(process.cwd(), "templates"),
];

export const templatesDir = templateDirCandidates.find((candidate) => fs.existsSync(candidate)) || templateDirCandidates[0];

export function loadTemplateFile(file: string): GameTemplate {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = yaml.load(raw);
  return gameTemplateSchema.parse(parsed);
}

export function loadTemplates(dir = templatesDir): GameTemplate[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true })
    .map((file) => String(file))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .map((file) => loadTemplateFile(path.join(dir, file)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseKvp(text: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    data[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return data;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function convertAmpKvp(id: string, kvp: Record<string, string>): GameTemplate {
  const name = kvp["Meta.DisplayName"] || kvp["App.DisplayName"] || id;
  const steamApp = kvp["Steam.AppID"] || kvp["App.SteamUpdateAnonymousLogin"] || kvp["Meta.SteamAppId"] || undefined;
  const image = kvp["Docker.Image"] || "ghcr.io/aetherpanel/steamcmd:latest";
  return gameTemplateSchema.parse({
    schema: "aetherpanel.template/v1",
    id: slugify(id.replace(/\.kvp$/, "")),
    name,
    category: kvp["Meta.Category"] || "Imported",
    summary: kvp["Meta.Description"] || `${name} imported from AMPTemplates metadata.`,
    install: {
      method: steamApp ? "steamcmd" : "docker_image",
      app_id: steamApp,
      anonymous: kvp["Steam.Login"] !== "manual",
      install_dir: "/data",
      image,
    },
    runtime: {
      working_dir: "/data",
      startup: kvp["App.CommandLine"] || kvp["App.ExecutableLinux"] || "./start.sh",
      console: true,
    },
    resources: {
      min_ram_mb: 2048,
      recommended_ram_mb: 4096,
      min_disk_gb: 20,
      cpu: "2 shared vCPU",
    },
    ports: [
      { key: "game", name: "Game Port", default: Number(kvp["App.Ports.$ApplicationPort1"] || 27015), protocol: "udp" },
    ],
    config_files: [],
    workshop: { enabled: false, providers: [] },
    backup: { include: ["/data"], exclude: ["/data/steamapps/downloading"] },
    supported_os: String(kvp["Meta.OS"] || "Linux").toLowerCase().includes("windows") ? ["linux", "windows"] : ["linux"],
    source: { type: "amp_import", url: "https://github.com/CubeCoders/AMPTemplates", needs_review: true },
  });
}

export interface ModAdapterResult {
  launchArgs: string[];
  configWrites: Array<{ file: string; key: string; value: string; format: string }>;
  warnings: string[];
}

export function applyModAdapter(template: GameTemplate, mods: ModEntry[]): ModAdapterResult {
  const enabled = mods.filter((mod) => mod.enabled).sort((a, b) => a.order - b.order);
  const ids = enabled.map((mod) => mod.id);
  const warnings = enabled.flatMap((mod) => mod.dependencies.filter((dep) => !ids.includes(dep)).map((dep) => `${mod.id} depends on missing ${dep}`));
  if (!template.workshop.enabled || !template.workshop.config_injection) {
    return { launchArgs: [], configWrites: [], warnings };
  }
  const injection = template.workshop.config_injection;
  const joined = injection.format === "semicolon_separated_ids" ? ids.join(";") : ids.join(",");
  if (injection.format === "launch_args") {
    return { launchArgs: ids.map((id) => `-mod=${id}`), configWrites: [], warnings };
  }
  return {
    launchArgs: [],
    configWrites: [{ file: injection.file, key: injection.key, value: joined, format: injection.format }],
    warnings,
  };
}
