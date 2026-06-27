import { Module } from "@nestjs/common";
import { ServicesModule } from "../services/services.module.js";
import { SchedulerController } from "./scheduler.controller.js";
import { SchedulerService } from "./scheduler.service.js";

@Module({ imports: [ServicesModule], controllers: [SchedulerController], providers: [SchedulerService] })
export class SchedulerModule {}
