import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
  constructor(private readonly prisma: PrismaService) {}

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
      return user;
    } catch (error) {
      throw this.mapUniqueEmail(error);
    }
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

    await this.prisma.user.delete({ where: { id }, select: { id: true } });
    return { id };
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
