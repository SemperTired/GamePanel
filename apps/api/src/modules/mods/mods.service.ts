import { Injectable, NotFoundException } from "@nestjs/common";
import { ModEntry, modEntrySchema } from "@aetherpanel/shared";
import { applyModAdapter } from "@aetherpanel/templates";
import { DataStore } from "../data.module.js";
import { TemplatesService } from "../templates/templates.service.js";

@Injectable()
export class ModsService {
  constructor(private readonly data: DataStore, private readonly templates: TemplatesService) {}

  list(serviceId: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    return service.mods;
  }

  async add(serviceId: string, input: unknown) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const mod = modEntrySchema.parse({ order: service.mods.length, ...this.normalizeModInput(input) }) as ModEntry;
    service.mods.push(mod);
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    const template = this.templates.get(service.template_id);
    return { mods: service.mods, adapter: template ? applyModAdapter(template, service.mods as ModEntry[]) : null };
  }

  private normalizeModInput(input: unknown) {
    if (!input || typeof input !== "object") return {};
    const body = input as Record<string, unknown>;
    const id = body.id ?? body.workshopId ?? body.modId;
    return {
      ...body,
      id,
      provider: body.provider ?? (body.workshopId ? "steam" : undefined),
    };
  }

  async reorder(serviceId: string, mods: unknown[]) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    service.mods = mods.map((mod, order) => modEntrySchema.parse({ ...(typeof mod === "object" && mod ? mod : {}), order }));
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    return service.mods;
  }
}
