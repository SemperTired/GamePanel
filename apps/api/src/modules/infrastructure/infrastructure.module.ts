import { Module } from "@nestjs/common";
import { InfrastructureController } from "./infrastructure.controller.js";
import { InfrastructureService } from "./infrastructure.service.js";

@Module({ controllers: [InfrastructureController], providers: [InfrastructureService], exports: [InfrastructureService] })
export class InfrastructureModule {}
