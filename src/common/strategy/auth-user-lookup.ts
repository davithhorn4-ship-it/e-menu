import type { Prisma } from '@prisma/client';

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
