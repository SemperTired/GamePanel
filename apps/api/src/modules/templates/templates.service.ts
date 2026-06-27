import { Injectable } from "@nestjs/common";
import { GameTemplate } from "@aetherpanel/shared";
import { additionalStarterTemplates, loadTemplates } from "@aetherpanel/templates";

@Injectable()
export class TemplatesService {
  private readonly templates: GameTemplate[] = [...loadTemplates(), ...additionalStarterTemplates]
    .sort((a, b) => Number(a.source?.needs_review ?? false) - Number(b.source?.needs_review ?? false))
    .filter((template, index, list) => list.findIndex((item) => item.id === template.id) === index);

  list() {
    return this.templates;
  }

  get(id: string) {
    return this.templates.find((template) => template.id === id);
  }
}
