import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { InstallPlan } from "./installers.js";

const exec = promisify(execCallback);
const serviceUid = process.env.AETHERPANEL_SERVICE_UID || "";
const serviceGid = process.env.AETHERPANEL_SERVICE_GID || "";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function prepareServiceFiles(plan: InstallPlan, options: { runInstallers?: boolean } = {}) {
  await fs.mkdir(plan.cachePath, { recursive: true });
  await fs.mkdir(plan.servicePath, { recursive: true });
  const manifestPath = path.join(plan.cachePath, ".aetherpanel-cache.json");
  const readyPath = path.join(plan.cachePath, ".aetherpanel-cache-ready");
  if (!(await pathExists(path.join(plan.cachePath, "README.aetherpanel.txt")))) {
    await fs.writeFile(path.join(plan.cachePath, "README.aetherpanel.txt"), "AetherPanel installer cache. Live installer output is stored here first, then copied into each new service instance.\n");
  }
  await fs.writeFile(manifestPath, JSON.stringify({ ...plan, servicePath: undefined, prepared_at: new Date().toISOString() }, null, 2));

  if (options.runInstallers && plan.commands.length && !(await pathExists(readyPath))) {
    await fs.writeFile(path.join(plan.cachePath, "install.aetherpanel.sh"), [`#!/usr/bin/env bash`, `set -euo pipefail`, `cd ${JSON.stringify(plan.cachePath)}`, ...plan.commands].join("\n") + "\n");
    await exec(plan.commands.join(" && "), {
      cwd: plan.cachePath,
      timeout: Number(process.env.AETHERPANEL_INSTALL_TIMEOUT_MS || 1800000),
      env: { ...process.env, INSTALL_DIR: plan.cachePath },
    });
    await fs.writeFile(readyPath, new Date().toISOString() + "\n");
  }

  await fs.rm(plan.servicePath, { recursive: true, force: true });
  await fs.mkdir(plan.servicePath, { recursive: true });
  await fs.cp(plan.cachePath, plan.servicePath, { recursive: true, force: false, errorOnExist: false });
  await fs.writeFile(path.join(plan.servicePath, ".aetherpanel-install.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(plan.servicePath, "install.aetherpanel.sh"), [`#!/usr/bin/env bash`, `set -euo pipefail`, `# Installers run in ${plan.cachePath}; service directories are created from that cache.`, `cd ${JSON.stringify(plan.servicePath)}`].join("\n") + "\n");
  await normalizeTree(plan.servicePath);
}

export async function refreshInstallCache(plan: InstallPlan) {
  await fs.rm(path.join(plan.cachePath, ".aetherpanel-cache-ready"), { force: true });
  await prepareServiceFiles(plan, { runInstallers: true });
}

async function normalizeTree(root: string) {
  await fs.chmod(root, 0o755).catch(() => undefined);
  if (!serviceUid || !serviceGid) return;
  await exec(`chown -R ${serviceUid}:${serviceGid} ${JSON.stringify(root)}`).catch(() => undefined);
}
