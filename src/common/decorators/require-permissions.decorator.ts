import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from 'src/modules/permissions/permission-catalog';

export const PERMISSIONS_KEY = 'permissions';

/**
 * The caller's role needs every listed permission (role_permissions table).
 * Works next to @Roles: when both are set, both must pass.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
