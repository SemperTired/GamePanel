import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DataStore } from "../data.module.js";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";

@ApiTags("nodes")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nodes")
export class NodesController {
  constructor(private readonly data: DataStore) {}

  @Get()
  @RequirePermission("nodes:read")
  list() {
    return [...this.data.nodes.values()];
  }

  @Post()
  @RequirePermission("nodes:write")
  async create(@Body() body: Record<string, unknown>) {
    const node = { id: crypto.randomUUID(), status: "pending", runtime: "docker", created_at: new Date().toISOString(), ...body };
    await this.data.saveNode(node);
    return node;
  }
}
