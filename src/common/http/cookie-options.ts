// src/common/http/cookie-options.ts
import type { CookieOptions, Response } from 'express';

import { parseDurationMs } from '../time/duration';

const DAY_MS = 24 * 60 * 60 * 1000;

function cookieSecure(): boolean {
  // Secure unless COOKIE_SECURE=false (local HTTP development).
  return String(process.env.COOKIE_SECURE ?? 'true').toLowerCase() === 'true';
}

function cookieSameSite(secure: boolean): CookieOptions['sameSite'] {
  const v = String(process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  if (v === 'lax' || v === 'strict') return v;
  // Browsers drop SameSite=None cookies that are not Secure.
  if (v === 'none') return secure ? 'none' : 'lax';
  return 'lax';
}

function cookieDomain(): string | undefined {
  // Host-only cookie (no Domain attribute) unless subdomains must share it.
  const d = (process.env.COOKIE_DOMAIN ?? '').trim();
  return d || undefined;
}

/**
 * Attributes shared by both auth cookies. Clearing a cookie needs the same
 * path/domain/sameSite/secure it was set with, so set and clear both start
 * from here. `path: '/'` so the cookies also reach /api/... behind a BFF.
 */
function baseCookieOptions(): CookieOptions {
  const secure = cookieSecure();
  return {
    httpOnly: true,
    secure,
    sameSite: cookieSameSite(secure),
    domain: cookieDomain(),
    path: '/',
  };
}

export function accessTokenCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_ACCESS_EXPIRES, 15 * 60 * 1000),
  };
}

export function refreshTokenCookieOptions(): CookieOptions {
  const days = Number.parseInt(process.env.JWT_REFRESH_COOKIE_DAYS ?? '', 10);
  return {
    ...baseCookieOptions(),
    maxAge: (Number.isFinite(days) && days > 0 ? days : 7) * DAY_MS,
  };
}

/** Sets both auth cookies (login and refresh). */
export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie('accessToken', tokens.accessToken, accessTokenCookieOptions());
  res.cookie('refreshToken', tokens.refreshToken, refreshTokenCookieOptions());
}

/** Clears both auth cookies (logout). */
export function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', baseCookieOptions());
  res.clearCookie('refreshToken', baseCookieOptions());
}
