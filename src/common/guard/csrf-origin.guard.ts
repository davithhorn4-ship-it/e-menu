import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  normalizeOrigin,
  parseOriginList,
} from '../security/origin';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);
  private readonly allowedOrigins: string[];

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    this.allowedOrigins = buildAllowedOrigins(
      parseOriginList(this.config.get<string>('APP_URLS')),
    );

    this.logger.log(
      `Allowed CSRF origins: ${
        this.allowedOrigins.length > 0
          ? this.allowedOrigins.join(', ')
          : '(none)'
      }`,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const hasAuthCookie =
      !!(req as any)?.cookies?.accessToken ||
      !!(req as any)?.cookies?.refreshToken;
    const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      req.method,
    );

    if (!hasAuthCookie || !isUnsafeMethod) {
      return true;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    const candidateOrigin =
      typeof originHeader === 'string'
        ? originHeader
        : typeof refererHeader === 'string'
          ? normalizeOrigin(refererHeader)
          : null;

    if (!candidateOrigin) {
      this.logger.warn(
        `CSRF origin missing. allowedOrigins=${this.allowedOrigins.join(', ') || '(none)'}`,
      );
      throw new UnauthorizedException({
        code: 'CSRF_ORIGIN_REQUIRED',
        message:
          'Origin or Referer header is required for cookie-authenticated requests',
      });
    }

    if (!isAllowedOrigin(candidateOrigin, this.allowedOrigins)) {
      this.logger.warn(
        `CSRF origin rejected. candidateOrigin=${candidateOrigin} allowedOrigins=${
          this.allowedOrigins.join(', ') || '(none)'
        }`,
      );
      throw new UnauthorizedException({
        code: 'CSRF_ORIGIN_INVALID',
        message: 'Origin is not allowed for cookie-authenticated requests',
      });
    }

    return true;
  }
}
