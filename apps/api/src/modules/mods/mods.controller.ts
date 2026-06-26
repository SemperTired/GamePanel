import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { ModsService } from "./mods.service.js";

@ApiTags("mods")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("services/:serviceId/mods")
export class ModsController {
  constructor(private readonly mods: ModsService) {}

  @Get()
  @RequirePermission("services:mods")
  list(@Param("serviceId") serviceId: string) {
    return this.mods.list(serviceId);
  }

  @Post()
  @RequirePermission("services:mods")
  add(@Param("serviceId") serviceId: string, @Body() body: unknown) {
    return this.mods.add(serviceId, body);
  }

  @Post("reorder")
  @RequirePermission("services:mods")
  reorder(@Param("serviceId") serviceId: string, @Body() body: { mods: unknown[] }) {
    return this.mods.reorder(serviceId, body.mods);
  }
}
