import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { ProvisioningModule } from "../provisioning/provisioning.module.js";
import { ServicesModule } from "../services/services.module.js";
import { EmailModule } from "../email/email.module.js";

@Module({ imports: [ProvisioningModule, ServicesModule, EmailModule], controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
