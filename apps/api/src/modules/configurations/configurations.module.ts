import { Module } from "@nestjs/common";
import { TemplatesModule } from "../templates/templates.module.js";
import { ConfigurationsController } from "./configurations.controller.js";
import { ConfigurationsService } from "./configurations.service.js";

@Module({ imports: [TemplatesModule], controllers: [ConfigurationsController], providers: [ConfigurationsService] })
export class ConfigurationsModule {}
