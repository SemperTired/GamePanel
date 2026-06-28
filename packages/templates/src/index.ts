import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { ConfigField, GameTemplate, ManagedConfigFile, ModEntry, gameTemplateSchema } from "@aetherpanel/shared";
export { additionalStarterTemplates } from "./starter-catalog.js";
export { buildInstallPlan, cacheRoot, dataRoot } from "./installers.js";
export type { InstallPlan } from "./installers.js";
export { prepareServiceFiles, refreshInstallCache, writeManagedConfigFiles } from "./provisioning-files.js";

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
  const templates = fs
    .readdirSync(dir, { recursive: true })
    .map((file) => String(file))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .map((file) => loadTemplateFile(path.join(dir, file)))
  return mergeDuplicateTemplates(templates).sort((a, b) => a.name.localeCompare(b.name));
}

function mergeDuplicateTemplates(templates: GameTemplate[]) {
  const byId = new Map<string, GameTemplate>();
  for (const template of templates) {
    const current = byId.get(template.id);
    byId.set(template.id, current ? mergeTemplateMetadata(current, template) : template);
  }
  return [...byId.values()];
}

function mergeTemplateMetadata(a: GameTemplate, b: GameTemplate): GameTemplate {
  const base = a.source?.needs_review && !b.source?.needs_review ? b : a;
  const supplement = base === a ? b : a;
  const richerConfig = (supplement.config_schema.fields.length + supplement.config_schema.files.length) > (base.config_schema.fields.length + base.config_schema.files.length)
    ? supplement.config_schema
    : base.config_schema;
  return gameTemplateSchema.parse({
    ...base,
    ports: mergeByKey(base.ports, supplement.ports, (item) => item.key),
    config_files: mergeByKey(base.config_files, supplement.config_files, (item) => item.path),
    config_schema: richerConfig,
    startup_variables: mergeByKey(base.startup_variables, supplement.startup_variables, (item) => item.key),
    workshop: base.workshop.enabled ? base.workshop : supplement.workshop,
    backup: base.backup.include.length ? base.backup : supplement.backup,
  });
}

function mergeByKey<T>(primary: T[], secondary: T[], getKey: (item: T) => string) {
  const merged = new Map<string, T>();
  for (const item of secondary) merged.set(getKey(item), item);
  for (const item of primary) merged.set(getKey(item), item);
  return [...merged.values()];
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

type AmpUpdateStage = Record<string, unknown>;
type AmpConfigField = Record<string, unknown>;
type AmpManagedConfigFile = Record<string, unknown>;
type AmpPort = Record<string, unknown>;

export function convertAmpKvp(id: string, kvp: Record<string, string>, metadata: { updates?: AmpUpdateStage[]; config?: AmpConfigField[]; metaConfig?: AmpManagedConfigFile[]; ports?: AmpPort[] } = {}): GameTemplate {
  const name = kvp["Meta.DisplayName"] || kvp["App.DisplayName"] || id;
  const steamStage = metadata.updates?.find((stage) => stage.UpdateSource === "SteamCMD");
  const fetchStage = metadata.updates?.find((stage) => ["FetchURL", "FetchURLFromJQ", "GithubRelease", "GitRepo"].includes(String(stage.UpdateSource || "")));
  const steamApp = String(steamStage?.UpdateSourceData || kvp["Steam.AppID"] || kvp["Meta.SteamAppId"] || "").trim() || undefined;
  const image = kvp["Docker.Image"] || "ghcr.io/aetherpanel/steamcmd:latest";
  const method = inferAmpInstallMethod(id, kvp, metadata.updates || [], steamApp);
  const startupVariables = ampStartupVariables(metadata.config || [], id);
  const configSchema = ampConfigSchema(metadata.config || [], metadata.metaConfig || []);
  const workshopApp = String(steamStage?.UpdateSourceArgs || kvp["App.EnvironmentVariables"]?.match(/"SteamAppId":"([^"]+)"/)?.[1] || steamApp || "").trim() || undefined;
  return gameTemplateSchema.parse({
    schema: "aetherpanel.template/v1",
    id: slugify(id.replace(/\.kvp$/, "")),
    name,
    category: kvp["Meta.Category"] || "Imported",
    summary: kvp["Meta.Description"] || `${name} imported from public game template metadata.`,
    install: {
      method,
      app_id: steamApp,
      anonymous: String(kvp["App.SteamUpdateAnonymousLogin"] || "True").toLowerCase() !== "false" && String(kvp["App.SteamForceLoginPrompt"] || "False").toLowerCase() !== "true",
      install_dir: "/data",
      image,
      installer_url: method === "direct_archive" && fetchStage?.UpdateSource === "FetchURL" ? validUrl(String(fetchStage.UpdateSourceData || "")) : undefined,
    },
    runtime: {
      working_dir: "/data",
      startup: ampCommandLine(kvp),
      console: true,
    },
    resources: {
      min_ram_mb: 2048,
      recommended_ram_mb: 4096,
      min_disk_gb: 20,
      cpu: "2 shared vCPU",
    },
    ports: ampPorts(metadata.ports || [], kvp),
    config_files: ampConfigFiles(kvp, configSchema.files),
    config_schema: configSchema,
    startup_variables: startupVariables,
    workshop: { enabled: Boolean(workshopApp), providers: workshopApp ? ["steam"] : [], app_id: workshopApp, collection_support: Boolean(workshopApp) },
    backup: { include: ["/data"], exclude: ["/data/steamapps/downloading"] },
    supported_os: String(kvp["Meta.OS"] || "Linux").toLowerCase().includes("windows") ? ["linux", "windows"] : ["linux"],
    source: { type: "external_import", url: "public-game-template-source", needs_review: true },
  });
}

function inferAmpInstallMethod(id: string, kvp: Record<string, string>, updates: AmpUpdateStage[], steamApp?: string): GameTemplate["install"]["method"] {
  const key = `${id} ${kvp["Meta.DisplayName"] || ""} ${kvp["App.DisplayName"] || ""}`.toLowerCase();
  if (key.includes("path-of-titans")) return "alderon";
  if (key.includes("fivem") || key.includes("redm") || key.includes("txadmin")) return "fivem";
  if (updates.some((stage) => stage.UpdateSource === "SteamCMD") || steamApp) return "steamcmd";
  if (updates.some((stage) => stage.UpdateSource === "FetchURL")) return "direct_archive";
  if (updates.some((stage) => ["GithubRelease", "GitRepo", "FetchURLFromJQ", "Executable"].includes(String(stage.UpdateSource || "")))) return "custom";
  return kvp["Meta.SpecificDockerImage"] ? "docker_image" : "manual";
}

function ampStartupVariables(config: AmpConfigField[], id: string) {
  const variables = config
    .filter((field) => field.FieldName && field.InputType !== "hidden" && !String(field.FieldName).startsWith("$"))
    .map((field) => ({
      key: String(field.FieldName),
      label: String(field.DisplayName || field.FieldName),
      default: String(field.DefaultValue || ""),
      customer_editable: true,
      required: Boolean(field.Required),
      sensitive: /password|token|key|secret|license|licence|auth/i.test(`${field.FieldName} ${field.DisplayName} ${field.Keywords}`),
    }));
  const lower = id.toLowerCase();
  if (lower.includes("path-of-titans") && !variables.some((field) => field.key === "AuthToken")) {
    variables.unshift({ key: "AuthToken", label: "Alderon Hosting Auth Token", default: "", customer_editable: true, required: true, sensitive: true });
  }
  if ((lower.includes("fivem") || lower.includes("redm")) && !variables.some((field) => field.key === "sv_licenseKey")) {
    variables.unshift({ key: "sv_licenseKey", label: "Cfx.re Server Registration Key", default: "", customer_editable: true, required: true, sensitive: true });
  }
  return variables;
}

function ampConfigSchema(config: AmpConfigField[], metaConfig: AmpManagedConfigFile[]): { fields: ConfigField[]; files: ManagedConfigFile[] } {
  return {
    fields: config
      .filter((field) => field.FieldName)
      .map((field) => {
        const key = String(field.FieldName);
        const inputType = String(field.InputType || "text");
        return {
          key,
          label: String(field.DisplayName || key),
          category: cleanAmpCategory(String(field.Category || "General")),
          subcategory: cleanAmpCategory(String(field.Subcategory || "General")),
          description: String(field.Description || ""),
          keywords: String(field.Keywords || ""),
          input_type: inputType,
          param_field_name: field.ParamFieldName ? String(field.ParamFieldName) : undefined,
          default: String(field.DefaultValue ?? ""),
          placeholder: field.Placeholder ? String(field.Placeholder) : undefined,
          required: Boolean(field.Required),
          sensitive: /password|token|key|secret|license|licence|auth/i.test(`${key} ${field.DisplayName || ""} ${field.Keywords || ""} ${inputType}`),
          hidden: Boolean(field.Hidden) || inputType.toLowerCase() === "hidden" || Boolean(field.ExcludeFromImport),
          customer_editable: !field.ExcludeFromImport && inputType.toLowerCase() !== "hidden",
          include_in_command_line: Boolean(field.IncludeInCommandLine),
          skip_if_empty: Boolean(field.SkipIfEmpty),
          min: numericOrUndefined(field.MinValue ?? field.Minimum ?? field.Min),
          max: numericOrUndefined(field.MaxValue ?? field.Maximum ?? field.Max),
          suffix: field.Suffix ? String(field.Suffix) : undefined,
          enum_values: normalizeEnumValues(field.EnumValues),
          special: field.Special ? String(field.Special) : undefined,
          raw: field,
        };
      }),
    files: metaConfig
      .filter((file) => file.ConfigFile)
      .map((file) => ({
        path: String(file.ConfigFile),
        type: String(file.ConfigType || inferConfigType(String(file.ConfigFile))),
        format: file.ConfigFormat ? String(file.ConfigFormat) : undefined,
        subsections: Array.isArray(file.Subsections) ? file.Subsections.map((section: Record<string, unknown>) => ({
          heading: String(section.Heading || ""),
          setting_mappings: Object.fromEntries(Object.entries((section.SettingMappings || {}) as Record<string, unknown>).map(([key, value]) => [key, String(value)])),
        })) : [],
        raw: file,
      })),
  };
}

function ampPorts(ports: AmpPort[], kvp: Record<string, string>) {
  const flat: AmpPort[] = [];
  for (const port of ports) {
    flat.push(port);
    if (Array.isArray(port.ChildPorts)) flat.push(...port.ChildPorts as AmpPort[]);
  }
  const mapped = flat.map((port, index) => ({
    key: slugify(String(port.Ref || port.Name || `port-${index + 1}`)),
    name: String(port.Name || port.Ref || `Port ${index + 1}`),
    default: Number(port.Port || 27015 + index),
    protocol: ampProtocol(String(port.Protocol || "udp")),
    required: true,
  })).filter((port) => Number.isFinite(port.default) && port.default > 0 && port.default <= 65535);
  return mapped.length ? mapped : [{ key: "game", name: "Game Port", default: Number(kvp["App.Ports.$ApplicationPort1"] || 27015), protocol: "udp" as const, required: true }];
}

function ampProtocol(value: string) {
  const lower = value.toLowerCase();
  if (lower === "both") return "both" as const;
  if (lower === "tcp") return "tcp" as const;
  return "udp" as const;
}

function ampConfigFiles(kvp: Record<string, string>, managedFiles: ManagedConfigFile[] = []) {
  const files = managedFiles.length ? managedFiles.map((file) => ({
    path: file.path,
    type: configType(file.type || inferConfigType(file.path)),
    editable: true,
  })) : [kvp["Meta.ConfigManifest"], kvp["Meta.MetaConfigManifest"]].filter(Boolean).map((file) => ({ path: String(file), type: "json" as const, editable: true }));
  const unique = new Map<string, { path: string; type: "ini" | "json" | "yaml" | "toml" | "properties" | "text" | "xml"; editable: boolean }>();
  for (const file of files) unique.set(file.path, file);
  return [...unique.values()];
}

function ampCommandLine(kvp: Record<string, string>) {
  const executable = kvp["App.ExecutableLinux"] || kvp["App.ExecutableWin"] || "./start.sh";
  const args = kvp["App.CommandLineArgs"] || kvp["App.LinuxCommandLineArgs"] || "";
  return `${executable} ${args}`.trim().replace(/\{\{\$?([A-Za-z0-9_]+)\}\}/g, "{$1}");
}

function validUrl(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function cleanAmpCategory(value: string) {
  return value.replace(/:.*$/, "").replace(/_/g, " ").trim() || "General";
}

function numericOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeEnumValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, label]) => [key, String(label)]));
}

function inferConfigType(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".ini") || lower.endsWith(".cfg") || lower.endsWith(".conf")) return "ini";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".properties")) return "properties";
  if (lower.endsWith(".xml")) return "xml";
  return "text";
}

function configType(value: string): "ini" | "json" | "yaml" | "toml" | "properties" | "text" | "xml" {
  const lower = value.toLowerCase();
  if (["ini", "json", "yaml", "toml", "properties", "text", "xml"].includes(lower)) return lower as "ini" | "json" | "yaml" | "toml" | "properties" | "text" | "xml";
  return inferConfigType(value) as "ini" | "json" | "yaml" | "toml" | "properties" | "text" | "xml";
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
