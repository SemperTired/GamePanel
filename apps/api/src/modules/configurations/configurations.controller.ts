import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { ConfigurationsService } from "./configurations.service.js";

@ApiTags("configurations")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("services/:serviceId/configuration")
export class ConfigurationsController {
  constructor(private readonly configurations: ConfigurationsService) {}

  @Get()
  @RequirePermission("services:read")
  get(@Param("serviceId") serviceId: string, @Req() request: { user: { sub?: string; role?: string } }) {
    return this.configurations.get(serviceId, request.user);
  }

  @Put("startup")
  updateStartup(@Param("serviceId") serviceId: string, @Body() body: { values: Record<string, string> }, @Req() request: { user: { sub?: string; role?: string } }) {
    return this.configurations.updateStartupVariables(serviceId, body.values || {}, request.user);
  }
}
