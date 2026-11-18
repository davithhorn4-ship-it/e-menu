import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { getCookie } from '../http/request-cookies';

/** True when `token` is a well-signed, unexpired access token. */
export type AccessTokenCheck = (token: string) => boolean;

export function makeAccessTokenCheck(secret: string): AccessTokenCheck {
  const jwt = new JwtService({ secret });
  return (token) => {
    try {
      return jwt.verify<{ tokenType?: string }>(token).tokenType === 'access';
    } catch {
      return false;
    }
  };
}

function bearerOf(req: Request): string | undefined {
  const header = req.headers?.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7).trim() || undefined
    : undefined;
}

/**
 * The access token a request authenticates with: the Bearer header, else the
 * `accessToken` cookie. When both are sent and the Bearer token is not a valid
 * access token (e.g. a stale value saved in Swagger's Authorize dialog) but
 * the cookie is, the cookie wins, so a bad header does not hide a good
 * session. Used by the attach-user middleware and JwtStrategy so both pick
 * the same token.
 */
export function selectAccessToken(
  req: Request,
  isValid: AccessTokenCheck,
): string | null {
  const bearer = bearerOf(req);
  const cookie = getCookie(req, 'accessToken');
  if (bearer && cookie && bearer !== cookie && !isValid(bearer)) {
    return isValid(cookie) ? cookie : bearer;
  }
  return bearer ?? cookie ?? null;
}
