import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { TemplatesService } from "./templates.service.js";

@ApiTags("templates")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission("templates:read")
  list() {
    return this.templates.list();
  }

  @Get(":id")
  @RequirePermission("templates:read")
  get(@Param("id") id: string) {
    const template = this.templates.get(id);
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  @Put(":id")
  @RequirePermission("templates:write")
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const template = await this.templates.update(id, body);
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }
}
