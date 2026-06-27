import { z } from "zod";

export const roles = ["superadmin", "provider_admin", "staff", "customer", "viewer"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const permissions = [
  "admin:access",
  "users:read",
  "users:write",
  "services:read",
  "services:write",
  "services:power",
  "services:console",
  "services:files",
  "services:mods",
  "templates:read",
  "templates:write",
  "nodes:read",
  "nodes:write",
  "infrastructure:read",
  "infrastructure:write",
  "billing:read",
  "billing:write",
  "settings:read",
  "settings:write",
  "audit:read",
] as const;
export const permissionSchema = z.enum(permissions);
export type Permission = z.infer<typeof permissionSchema>;

export const rolePermissions: Record<Role, Permission[]> = {
  superadmin: [...permissions],
  provider_admin: [
    "admin:access",
    "users:read",
    "users:write",
    "services:read",
    "services:write",
    "services:power",
    "services:console",
    "services:files",
    "services:mods",
    "templates:read",
    "templates:write",
    "nodes:read",
    "nodes:write",
    "infrastructure:read",
    "infrastructure:write",
    "billing:read",
    "billing:write",
    "settings:read",
    "settings:write",
    "audit:read",
  ],
  staff: ["admin:access", "users:read", "services:read", "services:write", "services:power", "services:console", "services:files", "services:mods", "templates:read", "infrastructure:read", "billing:read", "audit:read"],
  customer: ["services:read", "services:power", "services:console", "services:files", "services:mods", "billing:read", "templates:read"],
  viewer: ["services:read", "templates:read"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export const provisioningStatuses = [
  "pending_payment",
  "paid",
  "queued",
  "provisioning",
  "installing",
  "active",
  "suspended",
  "terminated",
  "failed",
] as const;
export const provisioningStatusSchema = z.enum(provisioningStatuses);
export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;

export const servicePowerStates = ["created", "running", "stopped", "crashed", "installing", "unknown"] as const;
export const servicePowerStateSchema = z.enum(servicePowerStates);
export type ServicePowerState = z.infer<typeof servicePowerStateSchema>;

export const protocolSchema = z.enum(["tcp", "udp", "both"]);
export type PortProtocol = z.infer<typeof protocolSchema>;

export const templatePortSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  default: z.number().int().min(1).max(65535),
  protocol: protocolSchema,
  required: z.boolean().default(true),
});
export type TemplatePort = z.infer<typeof templatePortSchema>;

export const configFileSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["ini", "json", "yaml", "toml", "properties", "text", "xml"]),
  editable: z.boolean().default(true),
  template: z.string().optional(),
});
export type ConfigFile = z.infer<typeof configFileSchema>;

export const workshopAdapterSchema = z.enum(["steam", "nexusmods", "modio", "thunderstore", "curseforge", "github", "direct_url", "manual"]);
export type WorkshopAdapter = z.infer<typeof workshopAdapterSchema>;

export const gameTemplateSchema = z.object({
  schema: z.literal("aetherpanel.template/v1").default("aetherpanel.template/v1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().default(""),
  install: z.object({
    method: z.enum(["steamcmd", "docker_image", "manual", "custom", "alderon", "fivem", "direct_archive"]),
    app_id: z.string().optional(),
    anonymous: z.boolean().default(true),
    install_dir: z.string().default("/data"),
    image: z.string().optional(),
    installer_url: z.string().url().optional(),
    cache_key: z.string().optional(),
    copy_strategy: z.enum(["copy", "hardlink", "reflink", "rsync"]).default("copy"),
    preinstall: z.array(z.string()).default([]),
    postinstall: z.array(z.string()).default([]),
  }),
  runtime: z.object({
    executable: z.string().optional(),
    working_dir: z.string().default("/data"),
    startup: z.string().min(1),
    stop_command: z.string().optional(),
    console: z.boolean().default(true),
  }),
  resources: z.object({
    min_ram_mb: z.number().int().min(256),
    recommended_ram_mb: z.number().int().min(256),
    min_disk_gb: z.number().int().min(1),
    cpu: z.string().default("2 shared vCPU"),
  }),
  ports: z.array(templatePortSchema).min(1),
  config_files: z.array(configFileSchema).default([]),
  environment: z.record(z.string(), z.string()).default({}),
  startup_variables: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    default: z.string().default(""),
    customer_editable: z.boolean().default(true),
  })).default([]),
  workshop: z.object({
    enabled: z.boolean().default(false),
    providers: z.array(workshopAdapterSchema).default([]),
    app_id: z.string().optional(),
    collection_support: z.boolean().default(false),
    config_injection: z.object({
      file: z.string(),
      key: z.string(),
      format: z.enum(["comma_separated_ids", "semicolon_separated_ids", "launch_args", "json_array", "xml_nodes"]),
    }).optional(),
  }).default({ enabled: false, providers: [], collection_support: false }),
  backup: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  }).default({ include: [], exclude: [] }),
  supported_os: z.array(z.enum(["linux", "windows"])).default(["linux"]),
  source: z.object({
    type: z.enum(["curated", "amp_import", "custom"]).default("curated"),
    url: z.string().optional(),
    needs_review: z.boolean().default(false),
  }).default({ type: "curated", needs_review: false }),
});
export type GameTemplate = z.infer<typeof gameTemplateSchema>;

export const modEntrySchema = z.object({
  id: z.string().min(1),
  provider: workshopAdapterSchema,
  name: z.string().default(""),
  summary: z.string().default(""),
  thumbnail_url: z.string().url().optional(),
  page_url: z.string().url().optional(),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
  version_lock: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
});
export type ModEntry = z.infer<typeof modEntrySchema>;

export const runtimePortBindingSchema = z.object({
  key: z.string(),
  host: z.number().int().min(1).max(65535),
  container: z.number().int().min(1).max(65535),
  protocol: protocolSchema,
  host_ip: z.string().default("0.0.0.0"),
});
export type RuntimePortBinding = z.infer<typeof runtimePortBindingSchema>;

export interface RuntimeCreateInput {
  serviceId: string;
  name: string;
  image: string;
  environment: Record<string, string>;
  ports: RuntimePortBinding[];
  volumeName: string;
  hostDataPath?: string;
  memoryMb: number;
  cpuLimit?: number;
  dataPath: string;
  startupCommand?: string;
  installPlan?: unknown;
}

export interface RuntimeTarget {
  mode?: "local" | "docker_host" | "agent" | "mock";
  docker_host?: string;
  agent_url?: string;
  agent_token?: string;
}

export interface RuntimeStats {
  running: boolean;
  cpu_percent: number;
  memory_mb: number;
  memory_limit_mb: number;
  network_rx_mb?: number;
  network_tx_mb?: number;
}

export interface RuntimeProvider {
  create(input: RuntimeCreateInput): Promise<string>;
  start(runtimeId: string): Promise<void>;
  stop(runtimeId: string): Promise<void>;
  restart(runtimeId: string): Promise<void>;
  kill(runtimeId: string): Promise<void>;
  delete(runtimeId: string): Promise<void>;
  logs(runtimeId: string, lines?: number): Promise<string>;
  stats(runtimeId: string): Promise<RuntimeStats>;
  sendCommand(runtimeId: string, command: string): Promise<boolean>;
  backup(runtimeId: string, destination: string): Promise<string>;
  restore(runtimeId: string, source: string): Promise<void>;
}

export const createServiceSchema = z.object({
  name: z.string().min(2).max(80),
  template_id: z.string().min(1),
  owner_user_id: z.string().min(1),
  location_id: z.string().min(1).default("local"),
  node_id: z.string().optional(),
  memory_mb: z.number().int().min(512).default(2048),
  disk_gb: z.number().int().min(1).default(20),
  cpu_limit: z.number().min(0).default(0),
  auto_start: z.boolean().default(false),
  startup_variables: z.record(z.string(), z.string()).default({}),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export function assertSafeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized === ".." || normalized.includes("\0")) {
    throw new Error("Unsafe path");
  }
  return normalized;
}
