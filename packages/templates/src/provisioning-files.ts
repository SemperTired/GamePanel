import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { InstallPlan } from "./installers.js";

const exec = promisify(execCallback);

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
  if (!(await pathExists(path.join(plan.cachePath, "README.aetherpanel.txt")))) {
    await fs.writeFile(path.join(plan.cachePath, "README.aetherpanel.txt"), "AetherPanel installer cache. Live installer output is stored here for future service copies.\n");
  }
  await fs.cp(plan.cachePath, plan.servicePath, { recursive: true, force: false, errorOnExist: false });
  await fs.writeFile(path.join(plan.servicePath, ".aetherpanel-install.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(plan.servicePath, "install.aetherpanel.sh"), [`#!/usr/bin/env bash`, `set -euo pipefail`, `cd ${JSON.stringify(plan.servicePath)}`, ...plan.commands].join("\n") + "\n");

  if (options.runInstallers && plan.commands.length) {
    await exec(plan.commands.join(" && "), {
      cwd: plan.servicePath,
      timeout: Number(process.env.AETHERPANEL_INSTALL_TIMEOUT_MS || 1800000),
      env: { ...process.env, INSTALL_DIR: plan.installDir },
    });
    await fs.cp(plan.servicePath, plan.cachePath, { recursive: true, force: true });
  }
}
