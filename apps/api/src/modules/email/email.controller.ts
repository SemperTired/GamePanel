import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { EmailService } from "./email.service.js";

@ApiTags("email")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("email")
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Get("outbox")
  @RequirePermission("admin:access")
  list() {
    return this.email.list();
  }
}
