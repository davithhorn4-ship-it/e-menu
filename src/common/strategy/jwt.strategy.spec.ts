import { Role } from '@prisma/client';

import { AUTH_USER_SELECT, setAuthUserLookup } from './auth-user-lookup';
import { invalidateAuthUser, resetAuthUserCache } from './auth-user-cache';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const token = 'header.payload.signature';
  const iat = Math.floor(new Date('2026-10-20T00:00:00.000Z').getTime() / 1000);
  const payload = { sub: 'user-1', tokenType: 'access' as const, iat };
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.STAFF,
    isActive: true,
    passwordChangedAt: null as Date | null,
  };
  const request = (headerToken = token) =>
    ({
      headers: { authorization: `Bearer ${headerToken}` },
      cookies: {},
    }) as any;

  let prisma: any;
  let strategy: JwtStrategy;

  beforeEach(() => {
    resetAuthUserCache();
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const config: any = { get: jest.fn().mockReturnValue('secret') };
    strategy = new JwtStrategy(prisma, config);
  });

  it('reuses the user loaded by the attach-user middleware for the same token', async () => {
    const req = request();
    setAuthUserLookup(req, { token, sub: 'user-1', user });

    await expect(strategy.validate(req, payload)).resolves.toEqual({
      userId: 'user-1',
      email: 'user@example.com',
      role: Role.STAFF,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('loads the user with a narrow select when nothing was stored', async () => {
    await expect(strategy.validate(request(), payload)).resolves.toEqual({
      userId: 'user-1',
      email: 'user@example.com',
      role: Role.STAFF,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: AUTH_USER_SELECT,
    });
    expect(AUTH_USER_SELECT).not.toHaveProperty('passwordHash');
    expect(AUTH_USER_SELECT).not.toHaveProperty('refreshTokenHash');
  });

  it('ignores a stored lookup made for another token or subject', async () => {
    const otherToken = request('other.token.value');
    setAuthUserLookup(otherToken, { token, sub: 'user-1', user: null });
    await expect(strategy.validate(otherToken, payload)).resolves.toMatchObject(
      { userId: 'user-1' },
    );

    const otherSub = request();
    setAuthUserLookup(otherSub, { token, sub: 'user-2', user: null });
    await expect(strategy.validate(otherSub, payload)).resolves.toMatchObject({
      userId: 'user-1',
    });

    // Second load is served by the auth user cache.
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches the loaded user until it is invalidated', async () => {
    await strategy.validate(request(), payload);
    await strategy.validate(request(), payload);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    invalidateAuthUser('user-1');
    prisma.user.findUnique.mockResolvedValue({ ...user, role: Role.MANAGER });

    await expect(strategy.validate(request(), payload)).resolves.toMatchObject({
      role: Role.MANAGER,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects a stored missing user without querying again', async () => {
    const req = request();
    setAuthUserLookup(req, { token, sub: 'user-1', user: null });

    await expect(strategy.validate(req, payload)).rejects.toMatchObject({
      response: { code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized access.' },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a deactivated user', async () => {
    const req = request();
    setAuthUserLookup(req, {
      token,
      sub: 'user-1',
      user: { ...user, isActive: false },
    });

    await expect(strategy.validate(req, payload)).rejects.toMatchObject({
      response: { code: 'AUTH_UNAUTHORIZED' },
    });
  });

  it('rejects a token issued before the password changed', async () => {
    const req = request();
    setAuthUserLookup(req, {
      token,
      sub: 'user-1',
      user: {
        ...user,
        passwordChangedAt: new Date('2026-10-21T00:00:00.000Z'),
      },
    });

    await expect(strategy.validate(req, payload)).rejects.toMatchObject({
      response: { code: 'AUTH_TOKEN_EXPIRED' },
    });
  });

  it('rejects refresh tokens before any lookup', async () => {
    await expect(
      strategy.validate(request(), { ...payload, tokenType: 'refresh' }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
