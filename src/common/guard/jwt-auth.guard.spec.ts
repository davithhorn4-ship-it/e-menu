import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';

const context = (headers: Record<string, string> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, cookies: {} }) }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it('passes through the specific error thrown by the strategy', () => {
    const err = new UnauthorizedException({
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Your session has expired. Please sign in again.',
    });
    expect(() => guard.handleRequest(err, false, undefined, context())).toThrow(
      err,
    );
  });

  it('maps an expired JWT to AUTH_TOKEN_EXPIRED', () => {
    const info = Object.assign(new Error('jwt expired'), {
      name: 'TokenExpiredError',
    });
    expect(() =>
      guard.handleRequest(null, false, info, context({ authorization: 'x' })),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }),
      }),
    );
  });

  it('answers AUTH_REQUIRED without any token', () => {
    expect(() =>
      guard.handleRequest(null, false, undefined, context()),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'AUTH_REQUIRED' }),
      }),
    );
  });

  it('returns the user when authenticated', () => {
    const user = { userId: 'u1' };
    expect(guard.handleRequest(null, user, undefined, context())).toBe(user);
  });
});
