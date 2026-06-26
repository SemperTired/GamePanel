import { Injectable, NotFoundException } from "@nestjs/common";
import { DataStore } from "../data.module.js";
import { TemplatesService } from "../templates/templates.service.js";

@Injectable()
export class ConfigurationsService {
  constructor(private readonly data: DataStore, private readonly templates: TemplatesService) {}

  get(serviceId: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const template = this.templates.get(service.template_id);
    if (!template) throw new NotFoundException("Template not found");
    return {
      service_id: service.id,
      template_id: template.id,
      startup_variables: template.startup_variables.map((variable) => ({
        ...variable,
        value: service.startup_variables?.[variable.key] ?? variable.default,
      })),
      config_files: template.config_files,
      ports: service.ports,
    };
  }

  async updateStartupVariables(serviceId: string, values: Record<string, string>) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const template = this.templates.get(service.template_id);
    if (!template) throw new NotFoundException("Template not found");
    const allowed = new Set(template.startup_variables.filter((variable) => variable.customer_editable).map((variable) => variable.key));
    service.startup_variables = {
      ...(service.startup_variables || {}),
      ...Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))),
    };
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return this.get(serviceId);
  }
}
