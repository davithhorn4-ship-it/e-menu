/* eslint-disable */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const ctx = (user?: any) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/x', user }),
      }),
    }) as any;

  let reflector: Reflector;
  let permissions: any;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    permissions = { hasPermissions: jest.fn() };
    guard = new PermissionsGuard(reflector, permissions);
  });

  it('passes routes without @RequirePermissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(permissions.hasPermissions).not.toHaveBeenCalled();
  });

  it('passes when the role holds the permissions', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user.view']);
    permissions.hasPermissions.mockResolvedValue(true);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', role: Role.STAFF })),
    ).resolves.toBe(true);
    expect(permissions.hasPermissions).toHaveBeenCalledWith(Role.STAFF, [
      'user.view',
    ]);
  });

  it('throws INSUFFICIENT_PERMISSION otherwise', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user.delete']);
    permissions.hasPermissions.mockResolvedValue(false);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', role: Role.STAFF })),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'INSUFFICIENT_PERMISSION' },
    });
  });
});
