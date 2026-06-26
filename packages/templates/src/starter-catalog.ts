import { GameTemplate, gameTemplateSchema } from "@aetherpanel/shared";

const standardPorts = [{ key: "game", name: "Game Port", default: 27015, protocol: "udp" as const, required: true }];

function steamTemplate(input: {
  id: string;
  name: string;
  category: string;
  appId: string;
  image?: string;
  ram?: number;
  disk?: number;
  cpu?: string;
  port?: number;
  protocol?: "tcp" | "udp" | "both";
  workshop?: boolean;
}): GameTemplate {
  return gameTemplateSchema.parse({
    schema: "aetherpanel.template/v1",
    id: input.id,
    name: input.name,
    category: input.category,
    summary: `${input.name} dedicated server template.`,
    install: { method: input.image ? "docker_image" : "steamcmd", app_id: input.appId, install_dir: "/data", image: input.image || "ghcr.io/aetherpanel/steamcmd:latest", anonymous: true },
    runtime: { working_dir: "/data", startup: "./start.sh", stop_command: "quit", console: true },
    resources: { min_ram_mb: Math.max(1024, Math.floor((input.ram || 4096) / 2)), recommended_ram_mb: input.ram || 4096, min_disk_gb: input.disk || 20, cpu: input.cpu || "2 shared vCPU" },
    ports: [{ ...standardPorts[0], default: input.port || 27015, protocol: input.protocol || "udp" }],
    config_files: [{ path: "server.cfg", type: "text", editable: true }],
    workshop: input.workshop ? { enabled: true, providers: ["steam"], app_id: input.appId, collection_support: true } : { enabled: false, providers: [] },
    backup: { include: ["/data"], exclude: ["/data/steamapps/downloading"] },
    supported_os: ["linux"],
    source: { type: "curated", needs_review: false },
  });
}

export const additionalStarterTemplates: GameTemplate[] = [
  steamTemplate({ id: "rust", name: "Rust", category: "Survival", appId: "258550", ram: 8192, disk: 40, cpu: "4 shared vCPU", workshop: false }),
  steamTemplate({ id: "ark-survival-ascended", name: "ARK: Survival Ascended", category: "Survival", appId: "2430930", ram: 16384, disk: 100, cpu: "5 shared vCPU", workshop: true }),
  steamTemplate({ id: "valheim", name: "Valheim", category: "Survival", appId: "896660", ram: 4096, disk: 20, port: 2456, workshop: false }),
  steamTemplate({ id: "palworld", name: "Palworld", category: "Survival", appId: "2394010", ram: 12288, disk: 40, cpu: "4 shared vCPU", port: 8211 }),
  steamTemplate({ id: "satisfactory", name: "Satisfactory", category: "Factory", appId: "1690800", ram: 12288, disk: 30, cpu: "4 shared vCPU", port: 7777 }),
  steamTemplate({ id: "factorio", name: "Factorio", category: "Factory", appId: "427520", image: "factoriotools/factorio:latest", ram: 2048, disk: 10, port: 34197 }),
  steamTemplate({ id: "counter-strike-2", name: "Counter-Strike 2", category: "FPS", appId: "730", ram: 4096, disk: 30, port: 27015, workshop: true }),
  steamTemplate({ id: "terraria-tshock", name: "Terraria/TShock", category: "Sandbox", appId: "105600", image: "ryshe/terraria:latest", ram: 1024, disk: 5, port: 7777, protocol: "tcp" }),
  steamTemplate({ id: "unturned", name: "Unturned", category: "Survival", appId: "1110390", ram: 2048, disk: 10, workshop: true }),
  steamTemplate({ id: "path-of-titans", name: "Path of Titans", category: "Survival", appId: "0", ram: 8192, disk: 30, cpu: "4 shared vCPU", port: 7777 }),
  steamTemplate({ id: "sons-of-the-forest", name: "Sons of the Forest", category: "Survival", appId: "2465200", ram: 8192, disk: 25, port: 8766 }),
  steamTemplate({ id: "enshrouded", name: "Enshrouded", category: "Survival", appId: "2278520", ram: 8192, disk: 30, port: 15636 }),
  steamTemplate({ id: "v-rising", name: "V Rising", category: "Survival", appId: "1829350", ram: 4096, disk: 20, port: 9876 }),
  steamTemplate({ id: "conan-exiles", name: "Conan Exiles", category: "Survival", appId: "443030", ram: 8192, disk: 50, cpu: "4 shared vCPU", port: 7777, workshop: true }),
  steamTemplate({ id: "team-fortress-2", name: "Team Fortress 2", category: "FPS", appId: "232250", ram: 2048, disk: 20, port: 27015, workshop: true }),
  steamTemplate({ id: "7-days-to-die", name: "7 Days to Die", category: "Survival", appId: "294420", ram: 8192, disk: 30, cpu: "4 shared vCPU", port: 26900 }),
];
