const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/**
 * Milliseconds in a JWT-style duration: `900` (seconds), `30s`, `15m`, `8h`,
 * `7d`. Anything else returns `fallbackMs`.
 *
 * Used for cookie lifetimes and refresh-session expiry, so they always match
 * the JWT_*_EXPIRES values the tokens are signed with.
 */
export function parseDurationMs(
  value: string | undefined | null,
  fallbackMs: number,
): number {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  if (/^\d+$/.test(v)) return Number(v) * 1_000;

  const match = /^(\d+)([smhd])$/.exec(v);
  if (!match) return fallbackMs;
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
