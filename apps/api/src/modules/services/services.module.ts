import { Module } from "@nestjs/common";
import { ServicesController } from "./services.controller.js";
import { ServicesService } from "./services.service.js";
import { TemplatesModule } from "../templates/templates.module.js";
import { ProvisioningModule } from "../provisioning/provisioning.module.js";

@Module({ imports: [TemplatesModule, ProvisioningModule], controllers: [ServicesController], providers: [ServicesService], exports: [ServicesService] })
export class ServicesModule {}
