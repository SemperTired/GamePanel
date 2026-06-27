import { Injectable } from "@nestjs/common";
import { GameTemplate, gameTemplateSchema } from "@aetherpanel/shared";
import { additionalStarterTemplates, buildInstallPlan, loadTemplates } from "@aetherpanel/templates";
import { DataStore } from "../data.module.js";

@Injectable()
export class TemplatesService {
  private readonly templates: GameTemplate[];

  constructor(private readonly data: DataStore) {
    this.templates = [...loadTemplates(), ...additionalStarterTemplates]
    .sort((a, b) => Number(a.source?.needs_review ?? false) - Number(b.source?.needs_review ?? false))
    .filter((template, index, list) => list.findIndex((item) => item.id === template.id) === index);
  }

  list() {
    this.applyOverrides();
    return this.templates.map((template) => this.withReadiness(template));
  }

  get(id: string) {
    this.applyOverrides();
    const template = this.templates.find((template) => template.id === id);
    return template ? this.withReadiness(template) : undefined;
  }

  async update(id: string, patch: Record<string, unknown>) {
    const index = this.templates.findIndex((template) => template.id === id);
    if (index < 0) return null;
    const current = this.templates[index];
    const next = gameTemplateSchema.parse({
      ...current,
      ...patch,
      install: { ...current.install, ...((patch.install as object | undefined) || {}) },
      runtime: { ...current.runtime, ...((patch.runtime as object | undefined) || {}) },
      resources: { ...current.resources, ...((patch.resources as object | undefined) || {}) },
      workshop: { ...current.workshop, ...((patch.workshop as object | undefined) || {}) },
      source: { ...current.source, type: "custom", needs_review: false },
    });
    this.templates[index] = next;
    const overrides = (this.data.settings.get("template_overrides") || {}) as Record<string, GameTemplate>;
    overrides[id] = next;
    await this.data.saveSetting("template_overrides", overrides);
    return next;
  }

  private applyOverrides() {
    const overrides = (this.data.settings.get("template_overrides") || {}) as Record<string, GameTemplate>;
    for (const [id, template] of Object.entries(overrides)) {
      const index = this.templates.findIndex((item) => item.id === id);
      if (index >= 0) this.templates[index] = gameTemplateSchema.parse(template);
    }
  }

  private withReadiness(template: GameTemplate) {
    const plan = buildInstallPlan(template, "template-readiness");
    const missingEnv = plan.readiness.required_env.filter((key) => !process.env[key]);
    return {
      ...template,
      readiness: {
        customer_ready: plan.readiness.customer_ready && missingEnv.length === 0,
        required_env: plan.readiness.required_env,
        missing_env: missingEnv,
        operator_actions: plan.readiness.operator_actions,
        warnings: plan.warnings,
      },
    };
  }
}
