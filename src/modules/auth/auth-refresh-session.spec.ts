import * as argon2 from 'argon2';

import { AuthService } from './auth.service';

const user = { id: 'u-1', email: 'a@b.c', role: 'ADMIN', isActive: true };

function setup(session: Record<string, unknown> | null) {
  const prisma = {
    refreshSession: {
      findFirst: jest.fn().mockResolvedValue(session && { ...session, user }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const jwt = {
    verifyAsync: jest.fn((token: string) =>
      Promise.resolve(
        token.startsWith('legacy')
          ? { sub: 'u-1', tokenType: 'refresh' }
          : { sub: 'u-1', sid: 's-1', tokenType: 'refresh' },
      ),
    ),
    signAsync: jest.fn((payload: { tokenType: string }) =>
      Promise.resolve(payload.tokenType === 'refresh' ? 'rt-next' : 'at-next'),
    ),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback ?? 'secret'),
    getOrThrow: jest.fn(() => 'secret'),
  };
  return {
    prisma,
    jwt,
    service: new AuthService(prisma as never, jwt as never, config as never),
  };
}

const future = new Date(Date.now() + 60_000);

describe('AuthService.refresh (one session per device)', () => {
  it('rotates the session token and signs it with the session id', async () => {
    const { prisma, jwt, service } = setup({
      id: 's-1',
      userId: 'u-1',
      tokenHash: await argon2.hash('rt-1'),
      previousTokenHash: null,
      expiresAt: future,
    });

    await expect(service.refresh('rt-1')).resolves.toEqual({
      accessToken: 'at-next',
      refreshToken: 'rt-next',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 's-1', tokenType: 'refresh' }),
      expect.anything(),
    );
    expect(prisma.refreshSession.updateMany.mock.calls[0][0].where).toEqual({
      id: 's-1',
      tokenHash: expect.any(String),
    });
  });

  it('accepts the previous token (another tab just rotated) without rotating again', async () => {
    const { prisma, service } = setup({
      id: 's-1',
      userId: 'u-1',
      tokenHash: await argon2.hash('rt-2'),
      previousTokenHash: await argon2.hash('rt-1'),
      expiresAt: future,
    });

    await expect(service.refresh('rt-1')).resolves.toEqual({
      accessToken: 'at-next',
      refreshToken: 'rt-1',
    });
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an unknown token, a missing session and a pre-session token', async () => {
    const { service } = setup({
      id: 's-1',
      userId: 'u-1',
      tokenHash: await argon2.hash('rt-2'),
      previousTokenHash: null,
      expiresAt: future,
    });
    await expect(service.refresh('rt-x')).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    await expect(service.refresh('legacy-token')).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    await expect(setup(null).service.refresh('rt-1')).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('logout ends only that device session', async () => {
    const { prisma, service } = setup(null);

    await service.logoutByRefreshToken('rt-1');

    expect(prisma.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 's-1', userId: 'u-1' },
    });
  });
});
