import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module.js";
import { DataModule } from "./data.module.js";
import { TemplatesModule } from "./templates/templates.module.js";
import { ServicesModule } from "./services/services.module.js";
import { ProvisioningModule } from "./provisioning/provisioning.module.js";
import { ModsModule } from "./mods/mods.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { NodesModule } from "./nodes/nodes.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { FilesModule } from "./files/files.module.js";
import { ConfigurationsModule } from "./configurations/configurations.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || "dev-only-change-me", signOptions: { expiresIn: "12h" } }),
    DataModule,
    AuditModule,
    AuthModule,
    TemplatesModule,
    ServicesModule,
    ProvisioningModule,
    ModsModule,
    SettingsModule,
    NodesModule,
    BillingModule,
    FilesModule,
    ConfigurationsModule,
    InfrastructureModule,
  ],
})
export class AppModule {}
