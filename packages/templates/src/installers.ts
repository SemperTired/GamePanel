import path from "node:path";
import { GameTemplate } from "@aetherpanel/shared";

export type InstallPlan = {
  method: GameTemplate["install"]["method"];
  cacheKey: string;
  cachePath: string;
  servicePath: string;
  installDir: string;
  copyStrategy: NonNullable<GameTemplate["install"]["copy_strategy"]>;
  image: string;
  commands: string[];
  warnings: string[];
};

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "service";
}

export function dataRoot(): string {
  return path.resolve(process.env.AETHERPANEL_DATA_ROOT || "./var/services");
}

export function cacheRoot(): string {
  return path.resolve(process.env.AETHERPANEL_CACHE_ROOT || path.join(dataRoot(), "_cache"));
}

export function buildInstallPlan(template: GameTemplate, serviceId: string): InstallPlan {
  const installDir = template.install.install_dir || "/data";
  const cacheKey = safeSegment(template.install.cache_key || template.install.app_id || template.id);
  const method = template.install.method;
  const commands: string[] = [];
  const warnings: string[] = [];

  commands.push(...template.install.preinstall);
  if (method === "steamcmd") {
    if (!template.install.app_id) warnings.push("SteamCMD template has no app_id; install command will be skipped.");
    else commands.push(`steamcmd +force_install_dir ${installDir} +login ${template.install.anonymous ? "anonymous" : "${STEAMCMD_USERNAME} ${STEAMCMD_PASSWORD}"} +app_update ${template.install.app_id} validate +quit`);
  }
  if (method === "alderon") {
    commands.push("alderon-installer --server --install-dir ${INSTALL_DIR}");
    warnings.push("Alderon credentials and the Path of Titans installer binary must be mounted or baked into the runtime image before live installs.");
  }
  if (method === "fivem") {
    commands.push("fivem-artifact-installer --target ${INSTALL_DIR}");
    warnings.push("FiveM artifact installer must be configured with license key and artifact channel before live installs.");
  }
  if (method === "direct_archive" && template.install.installer_url) {
    commands.push(`curl -fsSL ${template.install.installer_url} -o /tmp/${cacheKey}.archive`);
    commands.push(`aetherpanel-extract /tmp/${cacheKey}.archive ${installDir}`);
  }
  if (method === "custom") warnings.push("Custom installer templates require operator-reviewed preinstall/postinstall commands.");
  commands.push(...template.install.postinstall);

  return {
    method,
    cacheKey,
    cachePath: path.join(cacheRoot(), cacheKey),
    servicePath: path.join(dataRoot(), serviceId),
    installDir,
    copyStrategy: template.install.copy_strategy,
    image: template.install.image || "ghcr.io/aetherpanel/steamcmd:latest",
    commands,
    warnings,
  };
}
