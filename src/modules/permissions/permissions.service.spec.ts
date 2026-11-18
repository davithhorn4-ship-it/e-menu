import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';

import {
  ADMIN_ONLY_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
} from './permission-catalog';
import { PermissionsService } from './permissions.service';
import { ADMIN_ROLES, FULL_ACCESS_ROLES } from 'src/common/roles/role-groups';

describe('PermissionsService', () => {
  let prisma: any;
  let service: PermissionsService;
  let rows: { role: Role; permissionKey: string }[];

  beforeEach(() => {
    rows = [
      { role: Role.STAFF, permissionKey: 'user.view' },
      { role: Role.STAFF, permissionKey: 'menu.dashboard' },
      { role: Role.ADMIN, permissionKey: 'user.delete' },
    ];
    prisma = {
      permission: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            PERMISSION_CATALOG.filter((p) => where.key.in.includes(p.key)).map(
              (p) => ({ key: p.key }),
            ),
          ),
        ),
      },
      rolePermission: {
        findMany: jest.fn(() => Promise.resolve(rows)),
        deleteMany: jest.fn(({ where }) => {
          rows = rows.filter((r) => r.role !== where.role);
          return Promise.resolve({});
        }),
        createMany: jest.fn(({ data }) => {
          rows = [...rows, ...data];
          return Promise.resolve({});
        }),
      },
      user: {
        groupBy: jest.fn().mockResolvedValue([
          { role: Role.STAFF, _count: { _all: 4 } },
          { role: Role.ADMIN, _count: { _all: 1 } },
        ]),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    service = new PermissionsService(prisma);
  });

  it('checks every required key against the role grants', async () => {
    await expect(
      service.hasPermissions(Role.STAFF, ['user.view', 'menu.dashboard']),
    ).resolves.toBe(true);
    await expect(
      service.hasPermissions(Role.STAFF, ['user.view', 'user.delete']),
    ).resolves.toBe(false);
    await expect(
      service.hasPermissions(Role.MANAGER, ['user.view']),
    ).resolves.toBe(false);
    await expect(
      service.hasPermissions(undefined, ['user.view']),
    ).resolves.toBe(false);
  });

  it.each(FULL_ACCESS_ROLES)(
    'gives %s every catalog key, also a future one',
    async (role) => {
      await expect(service.getRolePermissions(role)).resolves.toEqual(
        [...PERMISSION_KEYS].sort(),
      );
      await expect(
        service.hasPermissions(role, ['some.future_key']),
      ).resolves.toBe(true);
    },
  );

  it('caches grants and shares one load between concurrent calls', async () => {
    await Promise.all([
      service.getRolePermissions(Role.STAFF),
      service.hasPermissions(Role.MANAGER, ['user.delete']),
    ]);
    await service.getRolePermissions(Role.STAFF);
    expect(prisma.rolePermission.findMany).toHaveBeenCalledTimes(1);
  });

  it('replaces a role grants and invalidates the cache', async () => {
    await service.getRolePermissions(Role.STAFF);

    await expect(
      service.setRolePermissions(Role.STAFF, [
        'user.view',
        'user.create',
        'user.view',
      ]),
    ).resolves.toEqual(['user.create', 'user.view']);

    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { role: Role.STAFF },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { role: Role.STAFF, permissionKey: 'user.view' },
        { role: Role.STAFF, permissionKey: 'user.create' },
      ],
    });
    expect(prisma.rolePermission.findMany).toHaveBeenCalledTimes(2);
    await expect(
      service.hasPermissions(Role.STAFF, ['menu.dashboard']),
    ).resolves.toBe(false);
  });

  it('refuses unknown permission keys without writing', async () => {
    await expect(
      service.setRolePermissions(Role.STAFF, ['user.view', 'user.fly']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses admin-only keys for other roles', async () => {
    await expect(
      service.setRolePermissions(Role.MANAGER, [...ADMIN_ONLY_KEYS]),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_ONLY_PERMISSION' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to edit a locked role (ADMIN)', async () => {
    await expect(
      service.setRolePermissions(Role.ADMIN, ['user.view']),
    ).rejects.toMatchObject({ response: { code: 'ROLE_LOCKED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lists every enum role with user counts and the lock flag', async () => {
    const roles = await service.listRoles();
    expect(roles.map((r) => r.role)).toEqual(Object.values(Role));
    expect(roles.find((r) => r.role === Role.MANAGER)).toMatchObject({
      permissions: [],
      userCount: 0,
      locked: false,
    });
    expect(roles.find((r) => r.role === Role.STAFF)?.userCount).toBe(4);
    expect(roles.find((r) => r.role === Role.ADMIN)).toMatchObject({
      userCount: 1,
      locked: true,
    });
  });

  it('syncs the code catalog on start and survives a DB error', async () => {
    await service.onModuleInit();
    expect(prisma.permission.createMany).toHaveBeenCalledWith({
      data: PERMISSION_CATALOG,
      skipDuplicates: true,
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: ADMIN_ROLES.flatMap((role) =>
        PERMISSION_KEYS.map((permissionKey) => ({ role, permissionKey })),
      ),
      skipDuplicates: true,
    });

    prisma.permission.createMany.mockRejectedValueOnce(new Error('down'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('covers every enum role with known keys only', () => {
    for (const role of Object.values(Role)) {
      for (const key of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(PERMISSION_KEYS).toContain(key);
      }
    }
  });

  it('keeps admin-only keys and user deletion with the admin roles', () => {
    for (const role of Object.values(Role)) {
      if (ADMIN_ROLES.includes(role)) continue;
      const grants = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
      for (const key of ADMIN_ONLY_KEYS) expect(grants.has(key)).toBe(false);
      expect(grants.has('user.delete')).toBe(false);
    }
  });
});
