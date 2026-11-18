import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import { findAuthUser } from 'src/common/strategy/auth-user-cache';
import {
  type AccessTokenPayload,
  type AuthUser,
  authUserProblem,
} from 'src/common/strategy/auth-user-lookup';
import { parseDurationMs } from 'src/common/time/duration';
import { hashPassword } from 'src/modules/users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthErrors } from './auth.errors';

/** Payload of a refresh token (see signTokens). */
interface RefreshTokenPayload {
  sub: string;
  sid?: string;
  tokenType?: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Hash of a random password, made once with the same cost as real ones. */
let dummyHash: Promise<string> | undefined;
const dummyPasswordHash = () =>
  (dummyHash ??= hashPassword(`no-such-user-${randomUUID()}`));

/**
 * Sign-in, token refresh and sign-out.
 *
 * - Access token: short-lived JWT checked on every request (JwtStrategy).
 * - Refresh token: long-lived JWT tied to one row of `refresh_sessions`
 *   (one per signed-in device). The row stores the token hashed and is
 *   rotated on every refresh; deleting the row signs that device out.
 */
@Injectable()
export class AuthService {
  private readonly access: { secret: string; expiresIn: string };
  private readonly refreshCfg: { secret: string; expiresIn: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.access = {
      secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
    };
    this.refreshCfg = {
      secret: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
    };
  }

  // ---------------------------------------------------------------- login

  async login(emailRaw: string, password: string): Promise<AuthTokens> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same answer, and about the same time, for an unknown email and a wrong
    // password: without a user, verify against a dummy hash so the response
    // time does not reveal which emails are registered.
    const passwordMatches = user
      ? await argon2.verify(user.passwordHash, password)
      : await argon2
          .verify(await dummyPasswordHash(), password)
          .then(() => false);

    if (!user || !passwordMatches) throw AuthErrors.invalidCredentials();
    if (!user.isActive) throw AuthErrors.accountDisabled();

    // One session per signed-in device: signing in here leaves other devices
    // signed in.
    const sessionId = randomUUID();
    const tokens = await this.signTokens(user, sessionId);

    await this.prisma.$transaction([
      this.prisma.refreshSession.deleteMany({
        where: { userId: user.id, expiresAt: { lte: new Date() } },
      }),
      this.prisma.refreshSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: await argon2.hash(tokens.refreshToken),
          expiresAt: tokens.refreshExpiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: { id: true },
      }),
    ]);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // -------------------------------------------------------------- refresh

  /**
   * New access and refresh tokens for a valid refresh token. The refresh
   * token rotates: the previous one is still accepted once, so two tabs that
   * refresh at the same time do not sign each other out.
   */
  async refresh(refreshToken?: string): Promise<AuthTokens> {
    if (!refreshToken) throw AuthErrors.refreshTokenRequired();

    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload?.sid) throw AuthErrors.invalidRefreshToken();

    const session = await this.prisma.refreshSession.findFirst({
      where: { id: payload.sid, userId: payload.sub },
      include: { user: true },
    });
    if (!session || !session.user.isActive) {
      throw AuthErrors.invalidRefreshToken();
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.endSession(session.userId, session.id);
      throw AuthErrors.refreshTokenExpired();
    }

    const isCurrent = await argon2.verify(session.tokenHash, refreshToken);
    // Another tab of the same browser may have rotated it a moment ago.
    const isPrevious =
      !isCurrent &&
      !!session.previousTokenHash &&
      (await argon2.verify(session.previousTokenHash, refreshToken));
    if (!isCurrent && !isPrevious) throw AuthErrors.invalidRefreshToken();

    const next = await this.signTokens(session.user, session.id);

    if (isCurrent) {
      // Rotate only if nobody rotated in between (optimistic concurrency);
      // otherwise keep handing out the token the client already has.
      const { count } = await this.prisma.refreshSession.updateMany({
        where: { id: session.id, tokenHash: session.tokenHash },
        data: {
          tokenHash: await argon2.hash(next.refreshToken),
          previousTokenHash: session.tokenHash,
          expiresAt: next.refreshExpiresAt,
        },
      });
      if (count === 1) {
        return {
          accessToken: next.accessToken,
          refreshToken: next.refreshToken,
        };
      }
    }

    return { accessToken: next.accessToken, refreshToken };
  }

  // --------------------------------------------------------------- logout

  /**
   * Ends the session a refresh token belongs to. Never fails: a missing,
   * invalid or expired token just has nothing to end.
   */
  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (payload?.sid) await this.endSession(payload.sub, payload.sid);
  }

  // ---------------------------------------------------- access-token user

  /**
   * Verifies an access token and returns the narrow auth user
   * ({ id, email, role }). Applies the same user rules as JwtStrategy
   * (authUserProblem). `onUserLoaded` receives the raw lookup result so the
   * caller can share it with JwtStrategy for the same request.
   */
  async getUserFromAccessToken(
    accessToken: string,
    onUserLoaded?: (sub: string, user: AuthUser | null) => void,
  ) {
    if (!accessToken) throw AuthErrors.accessTokenRequired();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.access.secret,
      });
    } catch {
      throw AuthErrors.invalidAccessToken();
    }
    if (payload.tokenType !== 'access') throw AuthErrors.invalidAccessToken();

    // Short-lived cache; invalidated on every user write (PrismaService).
    const user = await findAuthUser(this.prisma, payload.sub);
    onUserLoaded?.(payload.sub, user);

    if (!user || authUserProblem(user, payload.iat)) {
      throw AuthErrors.invalidAccessToken();
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  // -------------------------------------------------------------- helpers

  /** The refresh token's payload, or null when it is not a valid one. */
  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshCfg.secret,
      });
      return payload.tokenType === 'refresh' ? payload : null;
    } catch {
      return null;
    }
  }

  private async endSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.refreshSession.deleteMany({
      where: { id: sessionId, userId },
    });
  }

  private async signTokens(user: User, sessionId: string) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tokenType: 'access' as const,
      },
      {
        secret: this.access.secret,
        expiresIn: this.access.expiresIn as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        tokenType: 'refresh' as const,
        // Random id: without it two tokens signed in the same second are
        // identical, so rotation would hand back the same token.
        jti: randomUUID(),
      },
      {
        secret: this.refreshCfg.secret,
        expiresIn: this.refreshCfg.expiresIn as JwtSignOptions['expiresIn'],
      },
    );

    const refreshExpiresAt = new Date(
      Date.now() + parseDurationMs(this.refreshCfg.expiresIn, SEVEN_DAYS_MS),
    );

    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
