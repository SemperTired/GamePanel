import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermission, AuthGuard } from "../auth/auth.guard.js";
import { AuditService } from "./audit.service.js";

@ApiTags("audit")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("audit:read")
  list() {
    return this.audit.list();
  }
}
