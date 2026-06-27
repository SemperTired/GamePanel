import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { ServicesService } from "./services.service.js";

@ApiTags("services")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermission("services:read")
  list(@Req() request: { user: { sub?: string; role?: string } }) {
    return this.services.list(request.user);
  }

  @Post()
  @RequirePermission("services:write")
  create(@Body() body: unknown) {
    return this.services.create(body);
  }

  @Get(":id")
  @RequirePermission("services:read")
  get(@Param("id") id: string) {
    return this.services.get(id);
  }

  @Post(":id/provision")
  @RequirePermission("services:write")
  provision(@Param("id") id: string) {
    return this.services.provision(id);
  }

  @Post(":id/reinstall")
  @RequirePermission("services:write")
  reinstall(@Param("id") id: string) {
    return this.services.reinstall(id);
  }

  @Post(":id/refresh-cache")
  @RequirePermission("services:write")
  refreshCache(@Param("id") id: string) {
    return this.services.refreshCache(id);
  }

  @Get(":id/backups")
  @RequirePermission("services:read")
  backups(@Param("id") id: string) {
    return this.services.backups(id);
  }

  @Post(":id/backups")
  @RequirePermission("services:write")
  createBackup(@Param("id") id: string) {
    return this.services.createBackup(id);
  }

  @Post(":id/backups/restore")
  @RequirePermission("services:write")
  restoreBackup(@Param("id") id: string, @Body() body: { name?: string }) {
    return this.services.restoreBackup(id, body.name || "");
  }

  @Post(":id/suspend")
  @RequirePermission("services:write")
  suspend(@Param("id") id: string) {
    return this.services.suspend(id);
  }

  @Post(":id/activate")
  @RequirePermission("services:write")
  activate(@Param("id") id: string) {
    return this.services.activate(id);
  }

  @Delete(":id")
  @RequirePermission("services:write")
  delete(@Param("id") id: string) {
    return this.services.delete(id);
  }

  @Post(":id/power/:action")
  @RequirePermission("services:power")
  power(@Param("id") id: string, @Param("action") action: "start" | "stop" | "restart" | "kill") {
    return this.services.power(id, action);
  }

  @Get(":id/logs")
  @RequirePermission("services:console")
  logs(@Param("id") id: string) {
    return this.services.logs(id);
  }

  @Get(":id/stats")
  @RequirePermission("services:read")
  stats(@Param("id") id: string) {
    return this.services.stats(id);
  }

  @Post(":id/command")
  @RequirePermission("services:console")
  command(@Param("id") id: string, @Body() body: { command: string }) {
    return this.services.command(id, body.command);
  }
}
