import { AUTH_USER_SELECT, type AuthUser } from './auth-user-lookup';

/**
 * Short-lived in-memory cache of the auth user ({ id, email, role,
 * passwordChangedAt }) so authenticated requests do not query `users` every
 * time.
 *
 * Safety:
 * - Every write to the `user` model (role change, password reset, delete,
 *   login/refresh/logout token updates...) calls `invalidateAuthUser` through
 *   the Prisma extension in PrismaService, so changes apply on the next
 *   request in this process.
 * - After an invalidation the user is not cached again for a short window, so
 *   a read that raced an uncommitted transaction cannot put old data back.
 * - "Not found" is never cached.
 * - The cache is per process: with several API instances a change made on
 *   another instance is picked up at most one TTL later.
 *
 * TTL comes from AUTH_USER_CACHE_TTL_MS (default 10s, 0 disables the cache).
 */
const DEFAULT_TTL_MS = 10_000;
const MIN_NO_CACHE_WINDOW_MS = 10_000;
const MAX_ENTRIES = 5_000;

type Entry = { user: AuthUser; expiresAt: number };

const entries = new Map<string, Entry>();
const noCacheUntil = new Map<string, number>();
let noCacheAllUntil = 0;
let generation = 0;

export function getAuthUserCacheTtlMs(): number {
  const raw = process.env.AUTH_USER_CACHE_TTL_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_TTL_MS;
  const ttl = Number(raw);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 0;
}

const noCacheWindowMs = (ttl: number) => Math.max(ttl, MIN_NO_CACHE_WINDOW_MS);

export function getCachedAuthUser(id: string): AuthUser | undefined {
  const entry = entries.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(id);
    return undefined;
  }
  return entry.user;
}

function setCachedAuthUser(id: string, user: AuthUser, startedAt: number) {
  const ttl = getAuthUserCacheTtlMs();
  const now = Date.now();
  // Skip when a write happened while this user was being loaded, or while the
  // no-cache window after a write is still open.
  if (
    ttl <= 0 ||
    startedAt !== generation ||
    now < noCacheAllUntil ||
    now < (noCacheUntil.get(id) ?? 0)
  ) {
    return;
  }
  if (entries.size >= MAX_ENTRIES && !entries.has(id)) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(id, { user, expiresAt: now + ttl });
}

/**
 * Drops one cached user, or every cached user when `id` is not known (e.g.
 * updateMany / update by email).
 */
export function invalidateAuthUser(id?: string | null) {
  generation += 1;
  const until = Date.now() + noCacheWindowMs(getAuthUserCacheTtlMs());
  if (typeof id === 'string' && id) {
    entries.delete(id);
    noCacheUntil.set(id, until);
  } else {
    entries.clear();
    noCacheAllUntil = until;
  }
  if (noCacheUntil.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, value] of noCacheUntil) {
      if (value <= now) noCacheUntil.delete(key);
    }
  }
}

/** Test helper: forget everything. */
export function resetAuthUserCache() {
  entries.clear();
  noCacheUntil.clear();
  noCacheAllUntil = 0;
  generation = 0;
}

type AuthUserReader = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: typeof AUTH_USER_SELECT;
    }): Promise<AuthUser | null>;
  };
};

/** Loads the auth user, using the cache when possible. */
export async function findAuthUser(
  prisma: AuthUserReader,
  id: string,
): Promise<AuthUser | null> {
  const cached = getCachedAuthUser(id);
  if (cached) return cached;

  const startedAt = generation;
  const user = await prisma.user.findUnique({
    where: { id },
    select: AUTH_USER_SELECT,
  });
  if (user) setCachedAuthUser(id, user, startedAt);
  return user;
}

const USER_WRITE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Prisma `$allOperations` handler for the `user` model: runs the query, then
 * invalidates the cache for writes. Used by PrismaService.
 */
export async function invalidateAuthUserOnWrite<T>({
  operation,
  args,
  query,
}: {
  operation: string;
  args: any;
  query: (args: any) => Promise<T>;
}): Promise<T> {
  if (!USER_WRITE_OPERATIONS.has(operation)) return query(args);
  try {
    return await query(args);
  } finally {
    // Also on failure: a failed statement inside a larger transaction may
    // still be followed by other writes; invalidating is always safe.
    const where = (args as { where?: { id?: unknown } } | undefined)?.where;
    const id = where?.id;
    invalidateAuthUser(typeof id === 'string' ? id : undefined);
  }
}
