import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import type { Role } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { getAuthUserLookup } from './auth-user-lookup';
import { findAuthUser } from './auth-user-cache';

const cookieExtractor = (req: Request): string | null =>
  (req as any)?.cookies?.accessToken ?? null;

const extractAccessToken = ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderAsBearerToken(),
  cookieExtractor,
]);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const accessSecret = config.get<string>('JWT_ACCESS_SECRET');

    if (!accessSecret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not set');
    }

    super({
      jwtFromRequest: extractAccessToken,
      secretOrKey: accessSecret,
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: {
      sub: string;
      email?: string;
      role?: Role;
      tokenType?: 'access' | 'refresh';
      iat?: number;
    },
  ) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or malformed token.',
      });
    }

    // Reuse the user loaded by the global attach-user middleware for this
    // exact token; otherwise load it here (short-lived cache).
    const lookup = getAuthUserLookup(req, extractAccessToken(req), payload.sub);
    const user = lookup
      ? lookup.user
      : await findAuthUser(this.prisma, payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized access.',
      });
    }

    const passwordChangedAt = user.passwordChangedAt?.getTime();
    const issuedAt =
      typeof payload.iat === 'number' ? payload.iat * 1000 : null;
    if (passwordChangedAt && issuedAt && issuedAt < passwordChangedAt) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      });
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
