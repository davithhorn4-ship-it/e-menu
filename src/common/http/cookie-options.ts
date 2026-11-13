// src/common/http/cookie-options.ts
import type { CookieOptions } from 'express';

function cookieSecure(): boolean {
  // Recommended default: secure in production. You control via env.
  return String(process.env.COOKIE_SECURE ?? 'true').toLowerCase() === 'true';
}

function cookieSameSite(secure: boolean): CookieOptions['sameSite'] {
  const v = String(process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();

  if (v === 'lax' || v === 'strict') return v;
  if (v === 'none') return secure ? 'none' : 'lax';

  return 'lax';
}

function cookieDomain(): string | undefined {
  // Host-only cookie is safer (no domain attribute) unless you need subdomain sharing.
  const d = (process.env.COOKIE_DOMAIN ?? '').trim();
  return d ? d : undefined;
}

function parseDaysEnv(name: string, fallbackDays: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : fallbackDays;
  return Number.isFinite(n) && n > 0 ? n : fallbackDays;
}

function parseExpiresInMs(expiresIn: string, fallbackMs: number): number {
  const s = String(expiresIn).trim().toLowerCase();

  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;

  const m = s.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return fallbackMs;

  const n = parseInt(m[1], 10);
  const unit = m[2];

  return unit === 's'
    ? n * 1000
    : unit === 'm'
      ? n * 60 * 1000
      : unit === 'h'
        ? n * 60 * 60 * 1000
        : n * 24 * 60 * 60 * 1000;
}

export function refreshTokenCookieOptions(): CookieOptions {
  const secure = cookieSecure();
  const sameSite = cookieSameSite(secure);
  const domain = cookieDomain();
  const days = parseDaysEnv('JWT_REFRESH_COOKIE_DAYS', 7);

  return {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/', // ✅ IMPORTANT: allow cookie on /api/... (BFF)
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

export function clearRefreshTokenCookieOptions(): CookieOptions {
  const secure = cookieSecure();
  return {
    httpOnly: true,
    secure,
    sameSite: cookieSameSite(secure),
    domain: cookieDomain(),
    path: '/', // ✅ must match exactly
  };
}

export function accessTokenCookieOptions(): CookieOptions {
  const secure = cookieSecure();
  const sameSite = cookieSameSite(secure);
  const domain = cookieDomain();
  const maxAge = parseExpiresInMs(
    process.env.JWT_ACCESS_EXPIRES ?? '15m',
    15 * 60 * 1000,
  );

  return {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/',
    maxAge,
  };
}

export function clearAccessTokenCookieOptions(): CookieOptions {
  const secure = cookieSecure();
  return {
    httpOnly: true,
    secure,
    sameSite: cookieSameSite(secure),
    domain: cookieDomain(),
    path: '/',
  };
}
