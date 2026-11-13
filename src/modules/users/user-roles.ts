import { Role } from '@prisma/client';

import { isFullAccess } from 'src/common/roles/role-groups';

/**
 * Accounts an actor may create, change, reset or delete, and the roles they
 * may hand out. ADMIN and DEVELOPER manage everyone; MANAGER manages STAFF
 * only, so nobody can raise themselves through another account. Every other
 * role manages nobody, whatever permission keys it holds.
 */
const manageableRolesFor = (actor: Role | undefined): Role[] => {
  if (isFullAccess(actor)) return Object.values(Role);
  if (actor === Role.MANAGER) return [Role.STAFF];
  return [];
};

export const canManageUserRole = (
  actor: Role | undefined,
  target: Role,
): boolean => manageableRolesFor(actor).includes(target);
