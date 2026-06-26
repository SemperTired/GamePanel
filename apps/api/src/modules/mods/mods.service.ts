import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ModEntry, WorkshopAdapter, modEntrySchema } from "@aetherpanel/shared";
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

  providers(serviceId: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const template = this.templates.get(service.template_id);
    const templateProviders = template?.workshop.providers || [];
    const providers: Array<{ id: WorkshopAdapter; name: string; configured: boolean; searchable: boolean; web_url: string; note: string }> = [
      {
        id: "steam",
        name: "Steam Workshop",
        configured: Boolean(process.env.STEAM_WEB_API_KEY),
        searchable: Boolean(process.env.STEAM_WEB_API_KEY && template?.workshop.app_id),
        web_url: template?.workshop.app_id ? `https://steamcommunity.com/app/${template.workshop.app_id}/workshop/` : "https://steamcommunity.com/workshop/",
        note: templateProviders.includes("steam") ? "Native Workshop support is enabled for this game." : "Steam can be browsed, but this template has not declared native Workshop injection.",
      },
      {
        id: "nexusmods",
        name: "Nexus Mods",
        configured: Boolean(process.env.NEXUSMODS_API_KEY),
        searchable: false,
        web_url: "https://www.nexusmods.com/",
        note: "Nexus Mods browser is exposed as a WebUI. API-backed install manifests require per-game Nexus domain mapping.",
      },
      {
        id: "modio",
        name: "mod.io",
        configured: Boolean(process.env.MODIO_API_KEY),
        searchable: false,
        web_url: "https://mod.io/g",
        note: "Provider contract is ready; game adapters decide whether mod.io assets can be installed automatically.",
      },
      {
        id: "curseforge",
        name: "CurseForge",
        configured: Boolean(process.env.CURSEFORGE_API_KEY),
        searchable: false,
        web_url: "https://www.curseforge.com/",
        note: "Provider contract is ready for Minecraft and other CurseForge-backed games.",
      },
      {
        id: "manual",
        name: "Manual Upload",
        configured: true,
        searchable: false,
        web_url: "",
        note: "Use for direct mod packages, custom builds, or providers that block embedding.",
      },
    ];
    return { service, template, providers };
  }

  async search(serviceId: string, provider: WorkshopAdapter, query: string) {
    const service = this.data.services.get(serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const template = this.templates.get(service.template_id);
    if (!template) throw new NotFoundException("Template not found");
    if (provider === "steam") return this.searchSteam(template.workshop.app_id, query);
    if (provider === "nexusmods") {
      return {
        provider,
        web_url: "https://www.nexusmods.com/search/",
        items: [],
        message: "Nexus Mods blocks a universal public search API for arbitrary games. Use the embedded WebUI or configure a game-specific Nexus domain adapter.",
      };
    }
    return {
      provider,
      items: [],
      message: `${provider} search is scaffolded. Add a provider API key and a game adapter before enabling one-click installs from this source.`,
    };
  }

  private async searchSteam(appId: string | undefined, query: string) {
    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new BadRequestException("STEAM_WEB_API_KEY is not configured");
    if (!appId) throw new BadRequestException("This template does not define a Steam Workshop app id");
    const params = new URLSearchParams({
      key,
      query_type: "9",
      page: "1",
      numperpage: "24",
      appid: appId,
      search_text: query || "",
      return_metadata: "true",
      return_previews: "true",
      return_children: "true",
      return_tags: "true",
      format: "json",
    });
    const response = await fetch(`https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`);
    if (!response.ok) throw new BadRequestException(`Steam Workshop search failed: ${await response.text()}`);
    const body = await response.json() as any;
    const details = body?.response?.publishedfiledetails || [];
    return {
      provider: "steam",
      app_id: appId,
      items: details.map((item: any) => ({
        id: String(item.publishedfileid),
        provider: "steam",
        name: item.title || `Steam Workshop ${item.publishedfileid}`,
        summary: stripHtml(String(item.file_description || item.short_description || "")).slice(0, 240),
        thumbnail_url: item.preview_url || item.image_url,
        page_url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
        tags: (item.tags || []).map((tag: any) => tag.tag).filter(Boolean),
        subscriptions: item.subscriptions,
        favorited: item.favorited,
      })),
    };
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
