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
  readiness: {
    customer_ready: boolean;
    required_env: string[];
    operator_actions: string[];
  };
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
  const requiredEnv = new Set<string>();
  const operatorActions = new Set<string>();

  commands.push(...template.install.preinstall);
  if (method === "steamcmd") {
    if (!template.install.app_id) warnings.push("SteamCMD template has no app_id; install command will be skipped.");
    else {
      if (!template.install.anonymous) {
        requiredEnv.add("STEAMCMD_USERNAME");
        requiredEnv.add("STEAMCMD_PASSWORD");
      }
      commands.push(`steamcmd +force_install_dir "$INSTALL_DIR" +login ${template.install.anonymous ? "anonymous" : '"$STEAMCMD_USERNAME" "$STEAMCMD_PASSWORD"'} +app_update ${template.install.app_id} validate +quit`);
    }
  }
  if (method === "alderon") {
    requiredEnv.add("ALDERON_EMAIL");
    requiredEnv.add("ALDERON_PASSWORD");
    operatorActions.add("Install the Alderon server installer/launcher on every target node or set ALDERON_INSTALL_COMMAND to the approved non-interactive install command.");
    commands.push(`if [ -n "\${ALDERON_INSTALL_COMMAND:-}" ]; then eval "$ALDERON_INSTALL_COMMAND"; elif command -v alderon-installer >/dev/null 2>&1; then alderon-installer --server --install-dir "$INSTALL_DIR" --email "$ALDERON_EMAIL" --password "$ALDERON_PASSWORD"; else echo "Alderon installer is not configured. Set ALDERON_INSTALL_COMMAND or install alderon-installer." >&2; exit 42; fi`);
    warnings.push("Alderon/Path of Titans requires operator-provided credentials and installer command on each target node before live customer provisioning.");
  }
  if (method === "fivem") {
    requiredEnv.add("FIVEM_LICENSE_KEY");
    requiredEnv.add("FIVEM_ARTIFACT_URL");
    commands.push(`mkdir -p "$INSTALL_DIR/server" "$INSTALL_DIR/server-data"`);
    commands.push(`curl -fL "$FIVEM_ARTIFACT_URL" -o /tmp/fivem-artifact.tar.xz`);
    commands.push(`tar -xJf /tmp/fivem-artifact.tar.xz -C "$INSTALL_DIR/server"`);
    commands.push(`if [ ! -d "$INSTALL_DIR/server-data/resources" ]; then git clone --depth=1 https://github.com/citizenfx/cfx-server-data.git "$INSTALL_DIR/server-data"; fi`);
    commands.push(`cat > "$INSTALL_DIR/server-data/server.cfg" <<'EOF'
endpoint_add_tcp "0.0.0.0:\${FIVEM_PORT:-30120}"
endpoint_add_udp "0.0.0.0:\${FIVEM_PORT:-30120}"
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap
sets tags "aethernode,game-server"
sets locale "en-US"
sv_hostname "\${SERVER_NAME:-AetherNode FiveM}"
sets sv_projectName "\${SERVER_NAME:-AetherNode FiveM}"
sets sv_projectDesc "Hosted by AetherNode"
set onesync on
sv_maxclients \${MAX_PLAYERS:-48}
set steam_webApiKey "\${STEAM_WEB_API_KEY:-}"
sv_licenseKey "$FIVEM_LICENSE_KEY"
EOF`);
    warnings.push("FiveM requires a Cfx.re license key and a vetted Linux artifact URL before live provisioning.");
  }
  if (method === "direct_archive" && template.install.installer_url) {
    commands.push(`curl -fsSL ${template.install.installer_url} -o /tmp/${cacheKey}.archive`);
    commands.push(`aetherpanel-extract /tmp/${cacheKey}.archive "$INSTALL_DIR"`);
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
    readiness: {
      customer_ready: requiredEnv.size === 0 && operatorActions.size === 0,
      required_env: [...requiredEnv],
      operator_actions: [...operatorActions],
    },
  };
}
