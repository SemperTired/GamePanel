import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { ProvisioningService } from "./provisioning.service.js";

@ApiTags("provisioning")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("provisioning")
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get("jobs")
  @RequirePermission("services:read")
  list() {
    return this.provisioning.listFresh();
  }

  @Post("services/:serviceId")
  @RequirePermission("services:write")
  enqueue(@Param("serviceId") serviceId: string) {
    return this.provisioning.enqueue(serviceId);
  }
}
