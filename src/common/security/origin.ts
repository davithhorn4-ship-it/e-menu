// src/common/security/origin.ts
export function normalizeOrigin(o?: string | null) {
  if (!o) return null;

  const input = o.trim();
  if (!input) return null;

  try {
    const u = new URL(input);

    // Only allow browser CORS origins over HTTP(S).
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }

    // Reject credentialed URLs such as https://user:pass@example.com.
    if (u.username || u.password) {
      return null;
    }

    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`.toLowerCase();
  } catch {
    return null;
  }
}

export function parseOriginList(value?: string | null) {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAllowedOrigins(list: Array<string | undefined | null>) {
  const normalized = list.map(normalizeOrigin).filter(Boolean) as string[];
  return Array.from(new Set(normalized));
}

export function isAllowedOrigin(
  origin: string | undefined | null,
  allowedOrigins: string[],
) {
  const normalized = normalizeOrigin(origin);
  return !!normalized && allowedOrigins.includes(normalized);
}

export function isLoopbackOrigin(origin: string | undefined | null) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) === false) {
    return false;
  }

  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function isPrivateNetworkOrigin(origin: string | undefined | null) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return isPrivateIpv4(url.hostname);
  } catch {
    return false;
  }
}
