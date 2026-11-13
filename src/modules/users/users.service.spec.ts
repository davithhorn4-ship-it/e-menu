/* eslint-disable */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { canManageUserRole } from './user-roles';
import { SAFE_USER_SELECT, UsersService } from './users.service';

const admin = { userId: 'admin-1', role: Role.ADMIN };
const manager = { userId: 'manager-1', role: Role.MANAGER };
const staff = { userId: 'staff-1', role: Role.STAFF };

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'staff-2',
  fullName: 'Staff Two',
  email: 'staff2@example.com',
  phone: null,
  photoUrl: null,
  role: Role.STAFF,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('canManageUserRole', () => {
  it('lets ADMIN and DEVELOPER manage every role', () => {
    for (const actor of [Role.ADMIN, Role.DEVELOPER]) {
      for (const target of Object.values(Role)) {
        expect(canManageUserRole(actor, target)).toBe(true);
      }
    }
  });

  it('lets MANAGER manage STAFF only, and STAFF nobody', () => {
    expect(canManageUserRole(Role.MANAGER, Role.STAFF)).toBe(true);
    expect(canManageUserRole(Role.MANAGER, Role.MANAGER)).toBe(false);
    expect(canManageUserRole(Role.MANAGER, Role.ADMIN)).toBe(false);
    expect(canManageUserRole(Role.STAFF, Role.STAFF)).toBe(false);
    expect(canManageUserRole(undefined, Role.STAFF)).toBe(false);
  });
});

describe('UsersService', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        update: jest.fn(({ data }) => Promise.resolve(row(data))),
        delete: jest.fn().mockResolvedValue({ id: 'staff-2' }),
      },
      refreshSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    service = new UsersService(prisma);
  });

  it('never selects the password hash', () => {
    expect(SAFE_USER_SELECT).not.toHaveProperty('passwordHash');
  });

  it('pages and filters the list', async () => {
    const result = await service.listUsers({
      page: 2,
      limit: 10,
      search: ' dara ',
      role: Role.STAFF,
    } as any);

    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.role).toBe(Role.STAFF);
    expect(args.where.OR[0]).toEqual({
      fullName: { contains: 'dara', mode: 'insensitive' },
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('creates a STAFF user by default with a normalised email and hashed password', async () => {
    await service.createUser(
      {
        fullName: ' Dara ',
        email: ' Dara@Example.com ',
        password: 'password123',
      },
      manager,
    );
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      fullName: 'Dara',
      email: 'dara@example.com',
      role: Role.STAFF,
      isActive: true,
    });
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('refuses a MANAGER creating a MANAGER or ADMIN', async () => {
    for (const role of [Role.MANAGER, Role.ADMIN]) {
      await expect(
        service.createUser(
          {
            fullName: 'X',
            email: 'x@example.com',
            password: 'password123',
            role,
          },
          manager,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate email to EMAIL_TAKEN', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.createUser(
        { fullName: 'X', email: 'x@example.com', password: 'password123' },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('signs a user out everywhere when deactivated', async () => {
    await service.updateUser('staff-2', { isActive: false }, manager);
    expect(prisma.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'staff-2' },
    });
  });

  it('refuses changing your own role or deactivating yourself', async () => {
    prisma.user.findUnique.mockResolvedValue(
      row({ id: admin.userId, role: Role.ADMIN }),
    );
    await expect(
      service.updateUser(admin.userId, { role: Role.STAFF }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateUser(admin.userId, { isActive: false }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets anyone edit their own name', async () => {
    prisma.user.findUnique.mockResolvedValue(row({ id: staff.userId }));
    await expect(
      service.updateUser(staff.userId, { fullName: 'New Name' }, staff),
    ).resolves.toMatchObject({ fullName: 'New Name' });
  });

  it('resets a password, stamps passwordChangedAt and ends sessions', async () => {
    await service.resetPassword(
      'staff-2',
      { password: 'new-password-1' },
      admin,
    );
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(prisma.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'staff-2' },
    });
  });

  it('refuses deleting yourself and unknown users', async () => {
    await expect(
      service.deleteUser(admin.userId, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.deleteUser('missing', admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
