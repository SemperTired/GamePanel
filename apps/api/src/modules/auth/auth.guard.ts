import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, SetMetadata } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Permission, hasPermission, roleSchema } from "@aetherpanel/shared";

export const RequirePermission = (permission: Permission) => SetMetadata("permission", permission);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new UnauthorizedException("Missing bearer token");
    try {
      request.user = this.jwt.verify(token);
      const required = Reflect.getMetadata("permission", context.getHandler()) as Permission | undefined;
      if (required && !hasPermission(roleSchema.parse(request.user.role), required)) {
        throw new ForbiddenException("Insufficient permission");
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
