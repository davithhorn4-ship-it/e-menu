import type { Prisma, Role } from '@prisma/client';

/**
 * The only user fields needed to authenticate a request. Never add
 * passwordHash here.
 */
export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  passwordChangedAt: true,
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{
  select: typeof AUTH_USER_SELECT;
}>;

/**
 * True when a token was issued before the user's password last changed, so
 * it must be refused.
 *
 * JWT `iat` is in whole seconds while passwordChangedAt has milliseconds, so
 * the comparison is done in seconds: a token issued in the same second as the
 * change is accepted. Comparing milliseconds would reject the token of a login
 * made right after a password reset for its whole lifetime.
 */
export function issuedBeforePasswordChange(
  iat: number | undefined,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt || typeof iat !== 'number') return false;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

/** Why a token's user may not be authenticated. */
export type AuthUserProblem = 'AUTH_UNAUTHORIZED' | 'AUTH_TOKEN_EXPIRED';

/**
 * Checks the user an access token belongs to: it must exist, be active and
 * not have changed its password after the token was issued. Returns the
 * problem, or null when the user may proceed. Shared by JwtStrategy and
 * AuthService.getUserFromAccessToken so both apply the same rules.
 */
export function authUserProblem(
  user: AuthUser | null,
  iat: number | undefined,
): AuthUserProblem | null {
  if (!user || !user.isActive) return 'AUTH_UNAUTHORIZED';
  if (issuedBeforePasswordChange(iat, user.passwordChangedAt)) {
    return 'AUTH_TOKEN_EXPIRED';
  }
  return null;
}

/** Payload of an access token (see AuthService.signTokens). */
export interface AccessTokenPayload {
  sub: string;
  email?: string;
  role?: Role;
  tokenType?: 'access' | 'refresh';
  iat?: number;
}

/**
 * Result of the user lookup done by the global "attach req.user" middleware
 * (src/main.ts). Kept on the request so the JwtStrategy can reuse it instead
 * of loading the same user a second time. Only valid for this exact token.
 */
export interface AuthUserLookup {
  token: string;
  sub: string;
  user: AuthUser | null;
}

const AUTH_USER_LOOKUP_KEY = '__authUserLookup';

export function setAuthUserLookup(req: unknown, lookup: AuthUserLookup) {
  if (req && typeof req === 'object') {
    Object.defineProperty(req, AUTH_USER_LOOKUP_KEY, {
      value: lookup,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
}

/**
 * Returns the lookup stored for this request when it was made for the same
 * token and subject, otherwise undefined (caller must query itself).
 */
export function getAuthUserLookup(
  req: unknown,
  token: string | null | undefined,
  sub: string | undefined,
): AuthUserLookup | undefined {
  if (!req || typeof req !== 'object' || !token || !sub) return undefined;
  const lookup = (req as Record<string, unknown>)[AUTH_USER_LOOKUP_KEY] as
    | AuthUserLookup
    | undefined;
  if (!lookup || lookup.token !== token || lookup.sub !== sub) return undefined;
  return lookup;
}
