// src/common/guard/jwt-auth.guard.ts
import {
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { getCookie } from '../http/request-cookies';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: unknown, context: ExecutionContext) {
    // JwtStrategy throws specific errors (e.g. AUTH_TOKEN_EXPIRED after a
    // password change): pass them through instead of a generic code.
    if (err instanceof HttpException) throw err;

    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();
      const hasAuthHeader = !!req.headers['authorization'];
      const hasCookie = !!getCookie(req, 'accessToken');

      // passport-jwt passes jsonwebtoken errors (TokenExpiredError, ...).
      const jwtName = info instanceof Error ? info.name : undefined;
      const code =
        jwtName === 'TokenExpiredError'
          ? 'AUTH_TOKEN_EXPIRED'
          : jwtName === 'JsonWebTokenError'
            ? 'AUTH_TOKEN_INVALID'
            : hasAuthHeader || hasCookie
              ? 'AUTH_UNAUTHORIZED'
              : 'AUTH_REQUIRED';

      const message =
        code === 'AUTH_REQUIRED'
          ? 'You must sign in to access this feature.'
          : code === 'AUTH_TOKEN_EXPIRED'
            ? 'Your session has expired. Please sign in again.'
            : code === 'AUTH_TOKEN_INVALID'
              ? 'Invalid or malformed token.'
              : 'Unauthorized access.';

      throw new UnauthorizedException({ code, message });
    }
    return user;
  }
}
