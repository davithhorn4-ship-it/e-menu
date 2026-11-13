import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { type AuthUser } from 'src/common/strategy/auth-user-lookup';
import { findAuthUser } from 'src/common/strategy/auth-user-cache';

type RefreshPayload = {
  sub: string;
  sid?: string;
  tokenType?: 'access' | 'refresh';
};

const invalidRefreshToken = () =>
  new UnauthorizedException({
    code: 'INVALID_REFRESH_TOKEN',
    message: 'Refresh token is invalid or expired',
  });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(emailRaw: string, password: string) {
    const email = emailRaw.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Same answer for an unknown email and a wrong password.
    const passwordMatches =
      !!user?.passwordHash &&
      (await argon2.verify(user.passwordHash, password));
    if (!user || !passwordMatches) {
      if (user && !user.passwordHash) {
        throw new BadRequestException({
          code: 'PASSWORD_LOGIN_NOT_AVAILABLE',
          message: 'Password login is not available for this account',
        });
      }
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Account is disabled',
      });
    }

    // One session per signed-in device: signing in here leaves other devices signed in.
    const sessionId = randomUUID();
    const { accessToken, refreshToken, refreshExpiresAt } =
      await this.signTokens(user, sessionId);

    await this.prisma.refreshSession.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: await this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    });

    return { accessToken, refreshToken };
  }

  /** Ends one device's session. */
  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.refreshSession.deleteMany({
        where: { id: sessionId, userId },
      });
    }

    return { success: true };
  }

  async logoutByRefreshToken(refreshToken: string) {
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret || !refreshToken) {
      return { success: true };
    }

    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: refreshSecret,
      });

      if (payload.tokenType === 'refresh') {
        await this.logout(payload.sub, payload.sid);
      }
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token is required',
      });
    }

    let payload: RefreshPayload;

    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw invalidRefreshToken();
    }

    if (payload.tokenType !== 'refresh' || !payload.sid) {
      throw invalidRefreshToken();
    }

    const session = await this.prisma.refreshSession.findFirst({
      where: { id: payload.sid, userId: payload.sub },
      include: { user: true },
    });

    if (!session || session.user.isActive === false) {
      throw invalidRefreshToken();
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.logout(session.userId, session.id);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token is invalid or expired',
      });
    }

    const isCurrent = await argon2.verify(session.tokenHash, refreshToken);
    // Another tab of the same browser may have rotated it a moment ago.
    const isPrevious =
      !isCurrent &&
      !!session.previousTokenHash &&
      (await argon2.verify(session.previousTokenHash, refreshToken));

    if (!isCurrent && !isPrevious) {
      throw invalidRefreshToken();
    }

    const {
      accessToken,
      refreshToken: nextRefreshToken,
      refreshExpiresAt,
    } = await this.signTokens(session.user, session.id);

    if (isCurrent) {
      // Rotate only if nobody rotated in between; otherwise keep the token.
      const { count } = await this.prisma.refreshSession.updateMany({
        where: { id: session.id, tokenHash: session.tokenHash },
        data: {
          tokenHash: await this.hashToken(nextRefreshToken),
          previousTokenHash: session.tokenHash,
          expiresAt: refreshExpiresAt,
        },
      });
      if (count === 1) return { accessToken, refreshToken: nextRefreshToken };
    }

    return { accessToken, refreshToken };
  }

  /**
   * Verifies an access token and returns the narrow auth user
   * ({ id, email, role }). `onUserLoaded` receives the raw lookup result so
   * the caller can share it with the JwtStrategy for the same request.
   */
  async getUserFromAccessToken(
    accessToken: string,
    onUserLoaded?: (sub: string, user: AuthUser | null) => void,
  ) {
    if (!accessToken) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token is required',
      });
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tokenType?: 'access' | 'refresh';
        iat?: number;
      }>(accessToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (payload.tokenType !== 'access') {
        throw new Error('not an access token');
      }

      // Short-lived cache; invalidated on every user write (PrismaService).
      const user = await findAuthUser(this.prisma, payload.sub);
      onUserLoaded?.(payload.sub, user);

      if (!user || !user.isActive) {
        throw new Error('user missing or disabled');
      }

      const passwordChangedAt = user.passwordChangedAt?.getTime();
      const issuedAt =
        typeof payload.iat === 'number' ? payload.iat * 1000 : null;

      if (passwordChangedAt && issuedAt && issuedAt < passwordChangedAt) {
        throw new Error('issued before the password changed');
      }

      return { id: user.id, email: user.email, role: user.role };
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token is invalid or expired',
      });
    }
  }

  private async hashToken(token: string) {
    return argon2.hash(token);
  }

  private async signTokens(user: User, sessionId: string) {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.config.get<string>(
      'JWT_ACCESS_EXPIRES',
      '15m',
    ) as JwtSignOptions['expiresIn'];
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES',
      '7d',
    ) as JwtSignOptions['expiresIn'];

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tokenType: 'access' as const,
      },
      {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        tokenType: 'refresh' as const,
      },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      },
    );

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: this.computeExpiresAt(String(refreshExpiresIn)),
    };
  }

  private computeExpiresAt(expiresIn: string): Date {
    const value = expiresIn.trim().toLowerCase();
    if (/^\d+$/.test(value)) {
      return new Date(Date.now() + Number.parseInt(value, 10) * 1000);
    }

    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    const milliseconds =
      unit === 's'
        ? amount * 1000
        : unit === 'm'
          ? amount * 60 * 1000
          : unit === 'h'
            ? amount * 60 * 60 * 1000
            : amount * 24 * 60 * 60 * 1000;

    return new Date(Date.now() + milliseconds);
  }
}
