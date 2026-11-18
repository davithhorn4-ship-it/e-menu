import { Role } from '@prisma/client';
import {
  findAuthUser,
  invalidateAuthUser,
  invalidateAuthUserOnWrite,
  resetAuthUserCache,
} from './auth-user-cache';
import type { AuthUser } from './auth-user-lookup';

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  email: 'u1@example.com',
  role: Role.STAFF,
  isActive: true,
  passwordChangedAt: null,
  ...overrides,
});

const makePrisma = (rows: Record<string, AuthUser | null>) => {
  const findUnique = jest.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(rows[where.id] ?? null),
  );
  return { prisma: { user: { findUnique } }, findUnique };
};

describe('auth user cache', () => {
  const originalTtl = process.env.AUTH_USER_CACHE_TTL_MS;

  beforeEach(() => {
    resetAuthUserCache();
    delete process.env.AUTH_USER_CACHE_TTL_MS;
    jest.useFakeTimers({ now: new Date('2026-10-22T00:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalTtl === undefined) delete process.env.AUTH_USER_CACHE_TTL_MS;
    else process.env.AUTH_USER_CACHE_TTL_MS = originalTtl;
  });

  it('serves repeat lookups from the cache', async () => {
    const { prisma, findUnique } = makePrisma({ u1: user() });

    await expect(findAuthUser(prisma, 'u1')).resolves.toEqual(user());
    await expect(findAuthUser(prisma, 'u1')).resolves.toEqual(user());

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('loads again after the TTL expires', async () => {
    const { prisma, findUnique } = makePrisma({ u1: user() });

    await findAuthUser(prisma, 'u1');
    jest.advanceTimersByTime(10_001);
    await findAuthUser(prisma, 'u1');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('honours AUTH_USER_CACHE_TTL_MS, and 0 disables caching', async () => {
    process.env.AUTH_USER_CACHE_TTL_MS = '0';
    const { prisma, findUnique } = makePrisma({ u1: user() });

    await findAuthUser(prisma, 'u1');
    await findAuthUser(prisma, 'u1');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('never caches a missing user', async () => {
    const rows: Record<string, AuthUser | null> = { u1: null };
    const { prisma, findUnique } = makePrisma(rows);

    await expect(findAuthUser(prisma, 'u1')).resolves.toBeNull();
    rows.u1 = user();
    await expect(findAuthUser(prisma, 'u1')).resolves.toEqual(user());

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('returns fresh data right after the user is invalidated', async () => {
    const rows = { u1: user() };
    const { prisma } = makePrisma(rows);

    await findAuthUser(prisma, 'u1');
    rows.u1 = user({ role: Role.MANAGER, passwordChangedAt: new Date() });
    invalidateAuthUser('u1');

    await expect(findAuthUser(prisma, 'u1')).resolves.toEqual(rows.u1);
  });

  it('does not cache again during the window after a write', async () => {
    const { prisma, findUnique } = makePrisma({ u1: user() });

    invalidateAuthUser('u1');
    await findAuthUser(prisma, 'u1');
    await findAuthUser(prisma, 'u1');
    expect(findUnique).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(10_001);
    await findAuthUser(prisma, 'u1');
    await findAuthUser(prisma, 'u1');
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('drops a lookup that raced a write', async () => {
    let release!: (value: AuthUser) => void;
    const findUnique = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<AuthUser>((resolve) => (release = resolve)),
      )
      .mockResolvedValue(user({ role: Role.MANAGER }));
    const prisma = { user: { findUnique } };

    const pending = findAuthUser(prisma, 'u1');
    invalidateAuthUser('other-user'); // any write bumps the generation
    release(user());
    await pending;

    jest.advanceTimersByTime(10_001); // past the no-cache window of the write
    await expect(findAuthUser(prisma, 'u1')).resolves.toEqual(
      user({ role: Role.MANAGER }),
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('clears every user when the id is unknown', async () => {
    const { prisma, findUnique } = makePrisma({
      u1: user(),
      u2: user({ id: 'u2' }),
    });

    await findAuthUser(prisma, 'u1');
    await findAuthUser(prisma, 'u2');
    invalidateAuthUser();
    await findAuthUser(prisma, 'u1');
    await findAuthUser(prisma, 'u2');

    expect(findUnique).toHaveBeenCalledTimes(4);
  });

  describe('invalidateAuthUserOnWrite (Prisma extension)', () => {
    const cacheU1 = async () => {
      const { prisma, findUnique } = makePrisma({ u1: user() });
      await findAuthUser(prisma, 'u1');
      return { prisma, findUnique };
    };

    it.each(['update', 'upsert', 'delete'])(
      'invalidates the user on %s by id',
      async (operation) => {
        const { prisma, findUnique } = await cacheU1();
        const query = jest.fn().mockResolvedValue({ id: 'u1' });

        await invalidateAuthUserOnWrite({
          operation,
          args: { where: { id: 'u1' } },
          query,
        });
        await findAuthUser(prisma, 'u1');

        expect(query).toHaveBeenCalledTimes(1);
        expect(findUnique).toHaveBeenCalledTimes(2);
      },
    );

    it('invalidates everyone on updateMany / writes without an id', async () => {
      const { prisma, findUnique } = await cacheU1();

      await invalidateAuthUserOnWrite({
        operation: 'updateMany',
        args: { where: { email: 'u1@example.com' } },
        query: jest.fn().mockResolvedValue({ count: 1 }),
      });
      await findAuthUser(prisma, 'u1');

      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('invalidates even when the write fails', async () => {
      const { prisma, findUnique } = await cacheU1();

      await expect(
        invalidateAuthUserOnWrite({
          operation: 'update',
          args: { where: { id: 'u1' } },
          query: jest.fn().mockRejectedValue(new Error('boom')),
        }),
      ).rejects.toThrow('boom');
      await findAuthUser(prisma, 'u1');

      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('leaves the cache alone for reads', async () => {
      const { prisma, findUnique } = await cacheU1();

      await invalidateAuthUserOnWrite({
        operation: 'findMany',
        args: {},
        query: jest.fn().mockResolvedValue([]),
      });
      await findAuthUser(prisma, 'u1');

      expect(findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
