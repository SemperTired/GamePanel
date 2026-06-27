import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from "@nestjs/common";
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
