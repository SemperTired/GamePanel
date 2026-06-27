import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import bcrypt from "bcryptjs";
import { Role, roleSchema, roles } from "@aetherpanel/shared";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { DataStore, UserRecord } from "../data.module.js";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly data: DataStore) {}

  @Get()
  @RequirePermission("users:read")
  list() {
    return [...this.data.users.values()].map((user) => this.safe(user));
  }

  @Get("roles")
  @RequirePermission("users:read")
  listRoles() {
    return roles;
  }

  @Post()
  @RequirePermission("users:write")
  async create(@Body() body: { email: string; name?: string; role?: Role; password?: string }) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.includes("@")) throw new BadRequestException("Valid email is required");
    const existing = [...this.data.users.values()].find((user) => user.email.toLowerCase() === email);
    if (existing) return this.safe(existing);
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: `usr_${crypto.randomUUID()}`,
      email,
      name: body.name?.trim() || email.split("@")[0],
      role: roleSchema.parse(body.role || "customer"),
      password_hash: await bcrypt.hash(body.password || crypto.randomUUID(), 10),
      created_at: now,
    };
    await this.data.saveUser(user);
    return this.safe(user);
  }

  @Put(":id/role")
  @RequirePermission("users:write")
  async updateRole(@Param("id") id: string, @Body() body: { role: Role }) {
    const user = this.data.users.get(id);
    if (!user) throw new NotFoundException("User not found");
    user.role = roleSchema.parse(body.role);
    await this.data.saveUser(user);
    return this.safe(user);
  }

  @Put(":id/password")
  @RequirePermission("users:write")
  async updatePassword(@Param("id") id: string, @Body() body: { password: string }) {
    const user = this.data.users.get(id);
    if (!user) throw new NotFoundException("User not found");
    user.password_hash = await bcrypt.hash(body.password, 10);
    await this.data.saveUser(user);
    return this.safe(user);
  }

  private safe(user: UserRecord) {
    const { password_hash: _passwordHash, ...safe } = user;
    return safe;
  }
}
