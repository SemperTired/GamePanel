import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { GameTemplate, ManagedConfigFile } from "@aetherpanel/shared";
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

export async function prepareServiceFiles(plan: InstallPlan, options: { runInstallers?: boolean; variables?: Record<string, string> } = {}) {
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
      env: { ...process.env, ...(options.variables || {}), INSTALL_DIR: plan.cachePath },
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

export async function writeManagedConfigFiles(plan: InstallPlan, template: GameTemplate, values: Record<string, string> = {}) {
  const fields = new Map(template.config_schema.fields.map((field) => [field.key, field]));
  const merged = Object.fromEntries([...fields.values()].map((field) => [field.key, values[field.key] ?? field.default ?? ""]));
  for (const file of template.config_schema.files) {
    const relative = sanitizeManagedPath(file.path);
    const target = path.join(plan.servicePath, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, renderManagedConfigFile(file, merged), "utf8");
  }
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

function sanitizeManagedPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.?\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === ".." || normalized.includes("\0")) {
    throw new Error(`Unsafe managed config path: ${value}`);
  }
  return normalized;
}

function renderManagedConfigFile(file: ManagedConfigFile, values: Record<string, string>) {
  const type = file.type.toLowerCase();
  if (type === "json") return JSON.stringify(renderObjectFromMappings(file, values), null, 2) + "\n";
  if (type === "properties") return renderFlatMappings(file, values, "");
  if (type === "ini") return renderIniMappings(file, values);
  return renderFlatMappings(file, values, "# ");
}

function renderIniMappings(file: ManagedConfigFile, values: Record<string, string>) {
  const lines = ["; Managed by AetherPanel. Changes here may be overwritten by the Config tab."];
  for (const section of file.subsections) {
    if (section.heading) {
      lines.push("", `[${section.heading}]`);
    }
    for (const [prefix, fieldRef] of Object.entries(section.setting_mappings)) {
      const value = resolveMappingValue(fieldRef, values);
      if (value === "") continue;
      lines.push(`${prefix}${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

function renderFlatMappings(file: ManagedConfigFile, values: Record<string, string>, commentPrefix: string) {
  const lines = [`${commentPrefix}Managed by AetherPanel. Changes here may be overwritten by the Config tab.`];
  for (const section of file.subsections) {
    if (section.heading) lines.push(`${commentPrefix}${section.heading}`);
    for (const [prefix, fieldRef] of Object.entries(section.setting_mappings)) {
      const value = resolveMappingValue(fieldRef, values);
      if (value === "") continue;
      lines.push(`${prefix}${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

function renderObjectFromMappings(file: ManagedConfigFile, values: Record<string, string>) {
  const output: Record<string, unknown> = {};
  for (const section of file.subsections) {
    const target = section.heading ? (output[section.heading] = output[section.heading] || {}) as Record<string, unknown> : output;
    for (const [prefix, fieldRef] of Object.entries(section.setting_mappings)) {
      const key = prefix.replace(/[=:]\s*$/, "") || fieldRef;
      target[key] = coerceValue(resolveMappingValue(fieldRef, values));
    }
  }
  return output;
}

function resolveMappingValue(fieldRef: string, values: Record<string, string>) {
  if (fieldRef in values) return values[fieldRef] ?? "";
  const withoutDollar = fieldRef.startsWith("$") ? fieldRef.slice(1) : fieldRef;
  if (withoutDollar in values) return values[withoutDollar] ?? "";
  return fieldRef.includes("$") || /^[A-Za-z0-9_]+$/.test(fieldRef) ? "" : fieldRef;
}

function coerceValue(value: string) {
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (value !== "" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
