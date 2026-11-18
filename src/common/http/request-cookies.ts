import type { Request } from 'express';

/**
 * Reads one cookie as a string. Express types `req.cookies` as `any`
 * (cookie-parser), so this keeps the value typed and ignores anything that
 * is not a string.
 */
export function getCookie(req: Request, name: string): string | undefined {
  const cookies = (req as { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
