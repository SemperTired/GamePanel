import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { convertAmpKvp, parseKvp } from "./index.js";

const input = process.argv[2];
const output = process.argv[3] || path.resolve(process.cwd(), "packages/templates/templates/imported");

if (!input) {
  console.error("Usage: npm run templates:import:amp -- <AMPTemplates directory> [output directory]");
  process.exit(1);
}

fs.mkdirSync(output, { recursive: true });
const files = fs.readdirSync(input, { recursive: true })
  .map((file) => String(file))
  .filter((file) => file.endsWith(".kvp"))
  .sort((a, b) => a.localeCompare(b));

const used = new Set<string>();
for (const file of files) {
  const kvp = parseKvp(fs.readFileSync(path.join(input, file), "utf8"));
  const template = convertAmpKvp(file, kvp);
  let id = template.id;
  let suffix = 2;
  while (used.has(id)) id = `${template.id}-${suffix++}`;
  used.add(id);
  template.id = id;
  fs.writeFileSync(path.join(output, `${template.id}.yaml`), yaml.dump(template, { lineWidth: 120 }), "utf8");
}
console.log(`Imported ${files.length} AMPTemplates into ${output}`);
