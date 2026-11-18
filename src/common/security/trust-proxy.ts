/**
 * Value for Express `trust proxy`, from TRUST_PROXY.
 *
 * Express reads the client IP (used by the rate limiter) from
 * X-Forwarded-For only for the proxies trusted here. Trusting a proxy that is
 * not there lets any client pick its own IP and get around the rate limits,
 * so the default is `false` (use the socket address).
 *
 * - `false` (default): the API is reached directly.
 * - `1`, `2`, ...: number of proxies in front of the API (e.g. 1 behind one
 *   nginx / load balancer that appends to X-Forwarded-For).
 * - `true`: trust every hop (only when nothing can reach the API directly).
 * - anything else: passed through, e.g. `loopback` or `10.0.0.0/8,127.0.0.1`.
 */
export function parseTrustProxy(
  value: string | undefined | null,
): boolean | number | string {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '' || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return (value ?? '').trim();
}
