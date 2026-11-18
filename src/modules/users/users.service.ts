import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';

import { LocalFileStorage } from 'src/common/storage/local-file-storage';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { detectPhotoType, MAX_PHOTO_BYTES } from './user-photo';
import { canManageUserRole } from './user-roles';

/** The signed-in user making a user-management request. */
export type Actor = { userId: string; role?: Role };

/** Columns returned to the client. Secrets (passwordHash) are never selected. */
export const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  photoUrl: true,
  address: true,
  latitude: true,
  longitude: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{
  select: typeof SAFE_USER_SELECT;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalFileStorage,
  ) {}

  async findSafeById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return user;
  }

  async listUsers(query: ListUsersQueryDto) {
    const { page, limit } = query;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createUser(dto: CreateUserDto, actor: Actor) {
    const role = dto.role ?? Role.STAFF;
    this.assertCanManage(actor, role);

    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: this.normalizeEmail(dto.email),
          phone: this.optionalText(dto.phone),
          photoUrl: this.optionalText(dto.photoUrl),
          address: this.optionalText(dto.address),
          ...this.positionData(dto),
          passwordHash: await hashPassword(dto.password),
          role,
          isActive: dto.isActive ?? true,
        },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      throw this.mapUniqueEmail(error);
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: Actor) {
    const target = await this.findSafeById(id);
    const isSelf = target.id === actor.userId;

    if (isSelf && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_OWN_ACCESS',
        message: 'You cannot change your own role or deactivate yourself',
      });
    }
    if (!isSelf) this.assertCanManage(actor, target.role);
    if (dto.role !== undefined) this.assertCanManage(actor, dto.role);

    const data: Prisma.UserUpdateInput = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.email !== undefined
        ? { email: this.normalizeEmail(dto.email) }
        : {}),
      ...(dto.phone !== undefined
        ? { phone: this.optionalText(dto.phone) }
        : {}),
      ...(dto.photoUrl !== undefined
        ? { photoUrl: this.optionalText(dto.photoUrl) }
        : {}),
      ...(dto.address !== undefined
        ? { address: this.optionalText(dto.address) }
        : {}),
      ...this.positionData(dto),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    try {
      const [user] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id },
          data,
          select: SAFE_USER_SELECT,
        }),
        // A deactivated account is signed out on every device.
        ...(dto.isActive === false
          ? [this.prisma.refreshSession.deleteMany({ where: { userId: id } })]
          : []),
      ]);
      // A replaced or cleared photo URL frees the old uploaded file.
      if (dto.photoUrl !== undefined && user.photoUrl !== target.photoUrl) {
        await this.storage.remove(target.photoUrl);
      }
      return user;
    } catch (error) {
      throw this.mapUniqueEmail(error);
    }
  }

  /**
   * Stores an uploaded profile photo (JPEG, PNG or WebP, max 2 MB) and sets
   * photoUrl to its /uploads/... path. The type comes from the file's bytes,
   * never from the client's file name or Content-Type.
   */
  async setPhoto(
    id: string,
    file: { buffer?: Buffer } | undefined,
    actor: Actor,
  ): Promise<SafeUser> {
    const target = await this.findSafeById(id);
    if (target.id !== actor.userId) this.assertCanManage(actor, target.role);

    const bytes = file?.buffer;
    if (!bytes?.length) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'Send the image as multipart/form-data in the "file" field.',
      });
    }
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new PayloadTooLargeException({
        code: 'PHOTO_TOO_LARGE',
        message: 'The photo must be 2 MB or smaller.',
      });
    }
    const type = detectPhotoType(bytes);
    if (!type) {
      throw new UnsupportedMediaTypeException({
        code: 'PHOTO_TYPE_NOT_ALLOWED',
        message: 'Upload a JPEG, PNG or WebP image.',
      });
    }

    const url = await this.storage.save('users', bytes, type);
    let user: SafeUser;
    try {
      user = await this.prisma.user.update({
        where: { id },
        data: { photoUrl: url },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      await this.storage.remove(url);
      throw error;
    }
    await this.storage.remove(target.photoUrl);
    return user;
  }

  /** Clears the profile photo and deletes the uploaded file. */
  async removePhoto(id: string, actor: Actor): Promise<SafeUser> {
    const target = await this.findSafeById(id);
    if (target.id !== actor.userId) this.assertCanManage(actor, target.role);

    const user = await this.prisma.user.update({
      where: { id },
      data: { photoUrl: null },
      select: SAFE_USER_SELECT,
    });
    await this.storage.remove(target.photoUrl);
    return user;
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto, actor: Actor) {
    const target = await this.findSafeById(id);
    if (target.id !== actor.userId) this.assertCanManage(actor, target.role);

    const passwordHash = await hashPassword(dto.password);
    // Tokens issued before passwordChangedAt stop working (JwtStrategy), and
    // every refresh session ends.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date() },
        select: { id: true },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId: id } }),
    ]);
    return { id };
  }

  async deleteUser(id: string, actor: Actor) {
    if (id === actor.userId) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_SELF',
        message: 'You cannot delete your own account',
      });
    }
    const target = await this.findSafeById(id);
    this.assertCanManage(actor, target.role);

    try {
      await this.prisma.user.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      // shop_members.user_id is ON DELETE RESTRICT: someone who works in a
      // shop keeps their account so orders and audit history stay linked.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException({
          code: 'USER_HAS_SHOP_MEMBERSHIP',
          message:
            'This user works in a shop. Deactivate the account or remove them from the shop first.',
        });
      }
      throw error;
    }
    await this.storage.remove(target.photoUrl);
    return { id };
  }

  /**
   * latitude/longitude for a create or update. Both must be sent together:
   * two numbers to set the map position, or two nulls to clear it.
   */
  private positionData(dto: {
    latitude?: number | null;
    longitude?: number | null;
  }): { latitude?: number | null; longitude?: number | null } {
    const { latitude, longitude } = dto;
    if (latitude === undefined && longitude === undefined) return {};
    const bothSet =
      typeof latitude === 'number' && typeof longitude === 'number';
    const bothCleared = latitude === null && longitude === null;
    if (!bothSet && !bothCleared) {
      throw new BadRequestException({
        code: 'LOCATION_INCOMPLETE',
        message:
          'Send latitude and longitude together (two numbers), or both as null to clear the map position.',
      });
    }
    return { latitude, longitude };
  }

  private assertCanManage(actor: Actor, targetRole: Role) {
    if (!canManageUserRole(actor.role, targetRole)) {
      throw new ForbiddenException({
        code: 'CANNOT_MANAGE_ROLE',
        message: `You cannot manage accounts with role ${targetRole}`,
      });
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private optionalText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private mapUniqueEmail(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Email is already in use',
      });
    }
    return error;
  }
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}
