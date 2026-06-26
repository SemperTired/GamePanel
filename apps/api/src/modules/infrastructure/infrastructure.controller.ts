import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { InfrastructureService } from "./infrastructure.service.js";

@ApiTags("infrastructure")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("infrastructure")
export class InfrastructureController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get("connectors")
  @RequirePermission("infrastructure:read")
  list() {
    return this.infrastructure.list();
  }

  @Post("connectors")
  @RequirePermission("infrastructure:write")
  create(@Body() body: any) {
    return this.infrastructure.create(body);
  }

  @Post("connectors/:id/test")
  @RequirePermission("infrastructure:write")
  test(@Param("id") id: string) {
    return this.infrastructure.test(id);
  }

  @Get("services/:serviceId/port-plan")
  @RequirePermission("infrastructure:read")
  plan(@Param("serviceId") serviceId: string, @Query("connectorId") connectorId?: string) {
    return this.infrastructure.planForService(serviceId, connectorId);
  }

  @Post("services/:serviceId/apply-port-forwards")
  @RequirePermission("infrastructure:write")
  apply(@Param("serviceId") serviceId: string, @Body() body: { connectorId?: string }) {
    return this.infrastructure.applyForService(serviceId, body?.connectorId);
  }
}
