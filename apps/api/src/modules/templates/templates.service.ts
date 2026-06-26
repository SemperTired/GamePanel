import { Injectable } from "@nestjs/common";
import { GameTemplate } from "@aetherpanel/shared";
import { additionalStarterTemplates, loadTemplates } from "@aetherpanel/templates";

@Injectable()
export class TemplatesService {
  private readonly templates: GameTemplate[] = [...loadTemplates(), ...additionalStarterTemplates].filter((template, index, list) => list.findIndex((item) => item.id === template.id) === index);

  list() {
    return this.templates;
  }

  get(id: string) {
    return this.templates.find((template) => template.id === id);
  }
}
