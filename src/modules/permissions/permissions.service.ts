import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { isFullAccess } from 'src/common/roles/role-groups';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ADMIN_ONLY_KEYS,
  LOCKED_ROLES,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
} from './permission-catalog';

/**
 * Cache lifetime. PUT invalidates this instance at once; the TTL bounds how
 * long another API instance can serve old grants.
 */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);
  private cache: { byRole: Map<Role, Set<string>>; loadedAt: number } | null =
    null;
  private loading: Promise<Map<Role, Set<string>>> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add catalog keys that are new in code and grant them to the locked roles.
   * Never removes or edits rows.
   */
  async onModuleInit() {
    try {
      await this.prisma.permission.createMany({
        data: PERMISSION_CATALOG,
        skipDuplicates: true,
      });
      await this.prisma.rolePermission.createMany({
        data: LOCKED_ROLES.flatMap((role) =>
          PERMISSION_KEYS.map((permissionKey) => ({ role, permissionKey })),
        ),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(`Permission catalog sync skipped: ${String(error)}`);
    }
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
      select: { key: true, group: true, description: true },
    });
  }

  /**
   * Every enum role with its granted keys (roles without grants included),
   * how many users hold it, and whether it is locked.
   */
  async listRoles() {
    const [byRole, counts] = await Promise.all([
      this.load(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    const userCounts = new Map(counts.map((c) => [c.role, c._count._all]));
    return Object.values(Role).map((role) => ({
      role,
      permissions: [...(byRole.get(role) ?? [])].sort(),
      userCount: userCounts.get(role) ?? 0,
      locked: LOCKED_ROLES.includes(role),
    }));
  }

  /**
   * A role's keys. ADMIN and DEVELOPER (FULL_ACCESS_ROLES) always get every
   * catalog key too, even before the startup sync has seeded a new one, so
   * the frontend shows them every menu.
   */
  async getRolePermissions(role: Role): Promise<string[]> {
    const byRole = await this.load();
    const granted = new Set(byRole.get(role) ?? []);
    if (isFullAccess(role)) {
      for (const key of PERMISSION_KEYS) granted.add(key);
    }
    return [...granted].sort();
  }

  async hasPermissions(
    role: Role | undefined,
    keys: string[],
  ): Promise<boolean> {
    if (!role) return false;
    // ADMIN and DEVELOPER hold every key (FULL_ACCESS_ROLES).
    if (isFullAccess(role)) return true;
    const granted = (await this.load()).get(role);
    return keys.every((key) => granted?.has(key));
  }

  /** Replace a role's grants with exactly `keys`. */
  async setRolePermissions(role: Role, keys: string[]): Promise<string[]> {
    if (LOCKED_ROLES.includes(role)) {
      throw new BadRequestException({
        code: 'ROLE_LOCKED',
        message: `${role} always has every permission and cannot be edited.`,
      });
    }
    const unique = [...new Set(keys)];
    const adminOnly = unique.filter((key) =>
      (ADMIN_ONLY_KEYS as string[]).includes(key),
    );
    if (adminOnly.length > 0) {
      throw new BadRequestException({
        code: 'ADMIN_ONLY_PERMISSION',
        message: `Only the admin roles may hold: ${adminOnly.join(', ')}`,
      });
    }
    const known = await this.prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { key: true },
    });
    const knownKeys = new Set(known.map((p) => p.key));
    const unknown = unique.filter((key) => !knownKeys.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_PERMISSION',
        message: `Unknown permission keys: ${unknown.join(', ')}`,
      });
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: unique.map((permissionKey) => ({ role, permissionKey })),
      }),
    ]);
    this.invalidate();
    return this.getRolePermissions(role);
  }

  invalidate() {
    this.cache = null;
  }

  private async load(): Promise<Map<Role, Set<string>>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.byRole;
    }
    if (!this.loading) {
      this.loading = this.prisma.rolePermission
        .findMany({ select: { role: true, permissionKey: true } })
        .then((rows) => {
          const byRole = new Map<Role, Set<string>>();
          for (const row of rows) {
            const set = byRole.get(row.role) ?? new Set<string>();
            set.add(row.permissionKey);
            byRole.set(row.role, set);
          }
          this.cache = { byRole, loadedAt: Date.now() };
          return byRole;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }
}
