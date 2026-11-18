import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  type AccessTokenPayload,
  type AuthUserProblem,
  authUserProblem,
  getAuthUserLookup,
} from './auth-user-lookup';
import { makeAccessTokenCheck, selectAccessToken } from './access-token';
import { findAuthUser } from './auth-user-cache';

const PROBLEM_MESSAGES: Record<AuthUserProblem, string> = {
  AUTH_UNAUTHORIZED: 'Unauthorized access.',
  AUTH_TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  /** Bearer token, or the cookie when the Bearer token is invalid. */
  private readonly extractAccessToken: (req: Request) => string | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const accessSecret = config.get<string>('JWT_ACCESS_SECRET');

    if (!accessSecret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not set');
    }

    const isValid = makeAccessTokenCheck(accessSecret);
    const extractAccessToken = (req: Request) =>
      selectAccessToken(req, isValid);

    super({
      jwtFromRequest: extractAccessToken,
      secretOrKey: accessSecret,
      passReqToCallback: true,
    });
    this.extractAccessToken = extractAccessToken;
  }

  async validate(req: Request, payload: AccessTokenPayload) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or malformed token.',
      });
    }

    // Reuse the user loaded by the global attach-user middleware for this
    // exact token; otherwise load it here (short-lived cache).
    const lookup = getAuthUserLookup(
      req,
      this.extractAccessToken(req),
      payload.sub,
    );
    const user = lookup
      ? lookup.user
      : await findAuthUser(this.prisma, payload.sub);

    const problem = authUserProblem(user, payload.iat);
    if (problem || !user) {
      throw new UnauthorizedException({
        code: problem ?? 'AUTH_UNAUTHORIZED',
        message: PROBLEM_MESSAGES[problem ?? 'AUTH_UNAUTHORIZED'],
      });
    }

    return { userId: user.id, email: user.email, role: user.role };
  }
}
