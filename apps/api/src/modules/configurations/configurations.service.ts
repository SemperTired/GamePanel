import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission, roleSchema } from "@aetherpanel/shared";
import { DataStore } from "../data.module.js";
import { TemplatesService } from "../templates/templates.service.js";

@Injectable()
export class ConfigurationsService {
  constructor(private readonly data: DataStore, private readonly templates: TemplatesService) {}

  get(serviceId: string, user?: { sub?: string; role?: string }) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    this.assertReadable(service, user);
    const template = this.templates.get(service.template_id);
    if (!template) throw new NotFoundException("Template not found");
    return {
      service_id: service.id,
      template_id: template.id,
      config_schema: {
        ...template.config_schema,
        fields: template.config_schema.fields.map((field) => ({
          ...field,
          value: service.startup_variables?.[field.key] ?? field.default,
        })),
      },
      startup_variables: template.startup_variables.map((variable) => ({
        ...variable,
        value: service.startup_variables?.[variable.key] ?? variable.default,
      })),
      config_files: template.config_files,
      runtime: template.runtime,
      ports: service.ports,
    };
  }

  async updateStartupVariables(serviceId: string, values: Record<string, string>, user?: { sub?: string; role?: string }) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    this.assertWritable(service, user);
    const template = this.templates.get(service.template_id);
    if (!template) throw new NotFoundException("Template not found");
    const allowed = new Set([
      ...template.startup_variables.filter((variable) => variable.customer_editable).map((variable) => variable.key),
      ...template.config_schema.fields.filter((field) => field.customer_editable && !field.hidden).map((field) => field.key),
    ]);
    service.startup_variables = {
      ...(service.startup_variables || {}),
      ...Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))),
    };
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return this.get(serviceId, user);
  }

  private assertReadable(service: { owner_user_id?: string }, user?: { sub?: string; role?: string }) {
    const role = roleSchema.parse(user?.role || "viewer");
    if (role === "customer" && service.owner_user_id !== user?.sub) throw new ForbiddenException("Service is not owned by this customer");
    if (!hasPermission(role, "services:read")) throw new ForbiddenException("Insufficient permission");
  }

  private assertWritable(service: { owner_user_id?: string }, user?: { sub?: string; role?: string }) {
    const role = roleSchema.parse(user?.role || "viewer");
    if (hasPermission(role, "services:write")) return;
    if (role === "customer" && service.owner_user_id === user?.sub) return;
    throw new ForbiddenException("Insufficient permission");
  }
}
