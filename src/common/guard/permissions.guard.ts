import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { PermissionsService } from 'src/modules/permissions/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { isFullAccess } from '../roles/role-groups';
import type { AuthRequest } from '../types/auth-request.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;
    const userRole: Role | undefined = user?.role;

    // ADMIN and DEVELOPER hold every key, also keys added later that are not
    // seeded yet (FULL_ACCESS_ROLES).
    if (isFullAccess(userRole)) return true;

    if (await this.permissions.hasPermissions(userRole, required)) {
      return true;
    }

    this.logger.warn(
      `Missing permission ${req.method} ${req.originalUrl ?? req.url}: userId=${user?.userId ?? 'none'} role=${userRole ?? 'none'} required=[${required.join(', ')}]`,
    );

    throw new ForbiddenException({
      code: 'INSUFFICIENT_PERMISSION',
      message: 'You do not have permission to access this resource.',
    });
  }
}
