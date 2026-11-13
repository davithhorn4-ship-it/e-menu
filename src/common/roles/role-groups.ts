import { Role } from '@prisma/client';

/**
 * Roles that pass every access check: @Roles (RolesGuard) and
 * @RequirePermissions (PermissionsGuard, also keys added later that are not
 * seeded yet). They never bypass data rules (validation, unique constraints).
 */
export const FULL_ACCESS_ROLES: Role[] = [Role.ADMIN, Role.DEVELOPER];

/** Roles that manage roles and permissions. */
export const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.DEVELOPER];

/** True when the user (or role) has full access (FULL_ACCESS_ROLES). */
export const isFullAccess = (
  userOrRole: { role?: Role | null } | Role | null | undefined,
): boolean => {
  const role =
    typeof userOrRole === 'string' ? userOrRole : (userOrRole?.role ?? null);
  return !!role && FULL_ACCESS_ROLES.includes(role);
};
