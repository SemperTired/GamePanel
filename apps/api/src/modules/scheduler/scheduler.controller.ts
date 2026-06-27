import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { SchedulerService } from "./scheduler.service.js";

@ApiTags("scheduler")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("scheduler")
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Get("tasks")
  @RequirePermission("services:read")
  list(@Query("service_id") serviceId?: string) {
    return this.scheduler.list(serviceId);
  }

  @Post("tasks")
  @RequirePermission("services:write")
  create(@Body() body: unknown) {
    return this.scheduler.create(body);
  }

  @Put("tasks/:id")
  @RequirePermission("services:write")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.scheduler.update(id, body);
  }

  @Post("tasks/:id/run")
  @RequirePermission("services:power")
  runNow(@Param("id") id: string) {
    return this.scheduler.runNow(id);
  }

  @Delete("tasks/:id")
  @RequirePermission("services:write")
  delete(@Param("id") id: string) {
    return this.scheduler.delete(id);
  }
}
