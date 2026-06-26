import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
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
