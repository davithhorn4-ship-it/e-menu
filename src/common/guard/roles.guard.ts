// common/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { isFullAccess } from '../roles/role-groups';
import type { AuthRequest } from '../types/auth-request.type';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const user = req.user; // set by JWT strategy
    const userRole: Role | undefined = user?.role;
    const requiredRoles = required.join(', ');

    this.logger.debug(
      `Role check ${req.method} ${req.originalUrl ?? req.url}: userId=${user?.userId ?? 'none'} email=${user?.email ?? 'none'} role=${userRole ?? 'none'} required=[${requiredRoles}]`,
    );

    // ADMIN and DEVELOPER pass every @Roles list (FULL_ACCESS_ROLES).
    if (isFullAccess(userRole) || (!!userRole && required.includes(userRole))) {
      return true;
    }

    this.logger.warn(
      `Insufficient role ${req.method} ${req.originalUrl ?? req.url}: userId=${user?.userId ?? 'none'} email=${user?.email ?? 'none'} role=${userRole ?? 'none'} required=[${requiredRoles}]`,
    );

    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to access this resource.',
    });
  }
}
