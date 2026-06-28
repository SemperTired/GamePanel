import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
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

  @Get(":id/docker")
  @RequirePermission("docker:read")
  async docker(@Param("id") id: string) {
    return this.agentRequest(this.getNodeAgent(id), "/docker");
  }

  @Delete(":id/docker/containers/:containerId")
  @RequirePermission("docker:write")
  async removeContainer(@Param("id") id: string, @Param("containerId") containerId: string, @Body() body: Record<string, unknown>, @Req() request: any) {
    const result = await this.agentRequest(this.getNodeAgent(id), `/docker/containers/${encodeURIComponent(containerId)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: body.confirm, force: body.force !== false }),
    });
    await this.data.recordAudit({
      id: crypto.randomUUID(),
      actor: request.user?.email || request.user?.sub || "operator",
      action: "docker.container.remove",
      target: containerId,
      metadata: { node_id: id, force: body.force !== false, result },
      created_at: new Date().toISOString(),
    });
    return result;
  }

  private getNodeAgent(id: string) {
    const node = this.data.nodes.get(id) as Record<string, unknown> | undefined;
    if (!node) throw new BadRequestException("Node not found");
    const url = String(node.agent_url || "");
    if (!url) throw new BadRequestException("Docker Manager requires a node agent URL");
    return { url: url.replace(/\/$/, ""), token: String(node.agent_token || process.env.AETHERPANEL_AGENT_TOKEN || "") };
  }

  private async agentRequest(agent: { url: string; token: string }, route: string, init: RequestInit = {}) {
    const response = await fetch(`${agent.url}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(agent.token ? { Authorization: `Bearer ${agent.token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new BadRequestException(body?.message || `Agent request failed ${response.status}`);
    return body;
  }
}
