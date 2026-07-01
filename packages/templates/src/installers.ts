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
    required_customer_variables: string[];
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

export function buildInstallPlan(template: GameTemplate, serviceId: string, roots: { dataRoot?: string; cacheRoot?: string } = {}): InstallPlan {
  const installDir = template.install.install_dir || "/data";
  const cacheKey = safeSegment(template.install.cache_key || template.install.app_id || template.id);
  const resolvedDataRoot = roots.dataRoot ? path.resolve(roots.dataRoot) : dataRoot();
  const resolvedCacheRoot = roots.cacheRoot ? path.resolve(roots.cacheRoot) : cacheRoot();
  const method = template.install.method;
  const commands: string[] = [];
  const warnings: string[] = [];
  const requiredEnv = new Set<string>();
  const requiredCustomerVariables = new Set<string>();
  const operatorActions = new Set<string>();
  for (const variable of template.startup_variables) {
    if (variable.required) requiredCustomerVariables.add(variable.key);
  }

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
    requiredCustomerVariables.add("AuthToken");
    commands.push(`curl -fL "https://launcher-cdn.alderongames.com/AlderonGamesCmd-Linux-x64" -o ./AlderonGamesCmd-Linux-x64`);
    commands.push(`chmod +x ./AlderonGamesCmd-Linux-x64`);
    commands.push(`./AlderonGamesCmd-Linux-x64 --game path-of-titans --server true --beta-branch "\${BranchKey:-production}" --auth-token "$AuthToken" --install-dir "$INSTALL_DIR"`);
    commands.push(`chmod u+x "$INSTALL_DIR/PathOfTitans/Binaries/Linux/PathOfTitansServer-Linux-Shipping"`);
    warnings.push("Path of Titans requires a customer-supplied Alderon hosting auth token for install and startup.");
  }
  if (method === "fivem") {
    requiredCustomerVariables.add("sv_licenseKey");
    commands.push(`mkdir -p "$INSTALL_DIR/server" "$INSTALL_DIR/server-data"`);
    commands.push(`FIVEM_DOWNLOAD_URL="\${FIVEM_ARTIFACT_URL:-$(curl -fsSL https://changelogs-live.fivem.net/api/changelog/versions/linux/server | sed -n 's/.*"recommended_download"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')}"`);
    commands.push(`curl -fL "$FIVEM_DOWNLOAD_URL" -o /tmp/fivem-artifact.tar.xz`);
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
set steam_webApiKey "\${steam_webApiKey:-\${STEAM_WEB_API_KEY:-}}"
sv_licenseKey "$sv_licenseKey"
EOF`);
    warnings.push("FiveM requires a customer-supplied Cfx.re server registration key. A platform Steam Web API key is used when the customer does not provide one.");
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
    cachePath: path.join(resolvedCacheRoot, cacheKey),
    servicePath: path.join(resolvedDataRoot, serviceId),
    installDir,
    copyStrategy: template.install.copy_strategy,
    image: template.install.image || "ghcr.io/aetherpanel/steamcmd:latest",
    commands,
    warnings,
    readiness: {
      customer_ready: requiredEnv.size === 0 && operatorActions.size === 0,
      required_env: [...requiredEnv],
      required_customer_variables: [...requiredCustomerVariables],
      operator_actions: [...operatorActions],
    },
  };
}
