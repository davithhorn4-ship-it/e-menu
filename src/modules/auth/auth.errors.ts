import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Errors answered by the auth endpoints, in one place so the codes the
 * frontend relies on stay consistent. (Errors from the JWT guard and
 * strategy, AUTH_*, live with them in src/common.)
 */
export const AuthErrors = {
  invalidCredentials: () =>
    new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    }),

  accountDisabled: () =>
    new ForbiddenException({
      code: 'ACCOUNT_DISABLED',
      message: 'Account is disabled',
    }),

  refreshTokenRequired: () =>
    new UnauthorizedException({
      code: 'REFRESH_TOKEN_REQUIRED',
      message: 'Refresh token is required',
    }),

  invalidRefreshToken: () =>
    new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid or expired',
    }),

  refreshTokenExpired: () =>
    new UnauthorizedException({
      code: 'REFRESH_TOKEN_EXPIRED',
      message: 'Refresh token is invalid or expired',
    }),

  accessTokenRequired: () =>
    new UnauthorizedException({
      code: 'ACCESS_TOKEN_REQUIRED',
      message: 'Access token is required',
    }),

  invalidAccessToken: () =>
    new UnauthorizedException({
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Access token is invalid or expired',
    }),
};
