import { Module } from "@nestjs/common";
import { ModsController } from "./mods.controller.js";
import { ModsService } from "./mods.service.js";
import { TemplatesModule } from "../templates/templates.module.js";

@Module({ imports: [TemplatesModule], controllers: [ModsController], providers: [ModsService] })
export class ModsModule {}
