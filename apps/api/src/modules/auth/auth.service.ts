import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { DataStore, UserRecord } from "../data.module.js";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly data: DataStore, private readonly jwt: JwtService) {}

  async onModuleInit(): Promise<void> {
    await this.data.seed();
  }

  async login(email: string, password: string): Promise<{ token: string; user: Omit<UserRecord, "password_hash"> }> {
    const user = [...this.data.users.values()].find((candidate) => candidate.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const token = await this.jwt.signAsync({ sub: user.id, id: user.id, email: user.email, role: user.role, name: user.name });
    const { password_hash: _passwordHash, ...safe } = user;
    await this.data.recordAudit({ id: crypto.randomUUID(), actor: user.email, action: "auth.login", target: user.id, created_at: new Date().toISOString() });
    return { token, user: safe };
  }
}
