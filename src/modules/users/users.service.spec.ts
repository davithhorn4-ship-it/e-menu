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
  let storage: { save: jest.Mock; remove: jest.Mock };
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
    storage = {
      save: jest.fn().mockResolvedValue('/uploads/users/new.png'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(prisma, storage as any);
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

  it('answers 409 USER_HAS_SHOP_MEMBERSHIP when the user works in a shop', async () => {
    prisma.user.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    await expect(service.deleteUser('staff-2', admin)).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_HAS_SHOP_MEMBERSHIP' },
    });
  });

  describe('location', () => {
    it('saves address and a full map position on create', async () => {
      await service.createUser(
        {
          fullName: 'Loc',
          email: 'loc@example.com',
          password: 'password123',
          address: '  St. 271, Phnom Penh ',
          latitude: 11.5564,
          longitude: 104.9282,
        },
        admin,
      );
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        address: 'St. 271, Phnom Penh',
        latitude: 11.5564,
        longitude: 104.9282,
      });
    });

    it('refuses half a position with LOCATION_INCOMPLETE', async () => {
      await expect(
        service.updateUser('staff-2', { latitude: 11.5 }, admin),
      ).rejects.toMatchObject({ response: { code: 'LOCATION_INCOMPLETE' } });
      await expect(
        service.updateUser('staff-2', { latitude: 11.5, longitude: null }, admin),
      ).rejects.toMatchObject({ response: { code: 'LOCATION_INCOMPLETE' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('clears the position when both are null', async () => {
      await service.updateUser(
        'staff-2',
        { latitude: null, longitude: null, address: null },
        admin,
      );
      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
        latitude: null,
        longitude: null,
        address: null,
      });
    });
  });

  describe('photo', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    it('stores a PNG, sets photoUrl and deletes the old upload', async () => {
      prisma.user.findUnique.mockResolvedValue(
        row({ photoUrl: '/uploads/users/old.png' }),
      );
      await service.setPhoto('staff-2', { buffer: png }, admin);
      expect(storage.save).toHaveBeenCalledWith('users', png, 'png');
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        photoUrl: '/uploads/users/new.png',
      });
      expect(storage.remove).toHaveBeenCalledWith('/uploads/users/old.png');
    });

    it('refuses a missing file, a fake image and a file over 2 MB', async () => {
      await expect(service.setPhoto('staff-2', undefined, admin)).rejects.toMatchObject({
        response: { code: 'PHOTO_REQUIRED' },
      });
      await expect(
        service.setPhoto('staff-2', { buffer: Buffer.from('<svg onload=alert(1)>') }, admin),
      ).rejects.toMatchObject({ status: 415, response: { code: 'PHOTO_TYPE_NOT_ALLOWED' } });
      const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
      await expect(service.setPhoto('staff-2', { buffer: big }, admin)).rejects.toMatchObject({
        status: 413,
        response: { code: 'PHOTO_TOO_LARGE' },
      });
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('removes the new file again when the database update fails', async () => {
      prisma.user.update.mockRejectedValue(new Error('db down'));
      await expect(service.setPhoto('staff-2', { buffer: png }, admin)).rejects.toThrow('db down');
      expect(storage.remove).toHaveBeenCalledWith('/uploads/users/new.png');
    });

    it('refuses a MANAGER changing an ADMIN photo', async () => {
      prisma.user.findUnique.mockResolvedValue(row({ id: 'admin-9', role: Role.ADMIN }));
      await expect(service.setPhoto('admin-9', { buffer: png }, manager)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('removes the photo and its file', async () => {
      prisma.user.findUnique.mockResolvedValue(row({ photoUrl: '/uploads/users/old.png' }));
      await service.removePhoto('staff-2', admin);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ photoUrl: null });
      expect(storage.remove).toHaveBeenCalledWith('/uploads/users/old.png');
    });

    it('deletes the uploaded photo when the user is deleted', async () => {
      prisma.user.findUnique.mockResolvedValue(row({ photoUrl: '/uploads/users/old.png' }));
      await service.deleteUser('staff-2', admin);
      expect(storage.remove).toHaveBeenCalledWith('/uploads/users/old.png');
    });
  });
});
