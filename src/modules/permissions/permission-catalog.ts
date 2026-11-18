import { Role } from '@prisma/client';
import { FULL_ACCESS_ROLES } from 'src/common/roles/role-groups';

/**
 * Permission keys checked by @RequirePermissions. Keys are stored in the
 * `permissions` table and must never be renamed; add new keys instead.
 */
export const PERMISSIONS = {
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_EDIT: 'user.edit',
  USER_DELETE: 'user.delete',
  SETTINGS_EDIT: 'settings.edit',
  CATEGORY_VIEW: 'category.view',
  CATEGORY_CREATE: 'category.create',
  CATEGORY_EDIT: 'category.edit',
  CATEGORY_DELETE: 'category.delete',
  SHOP_VIEW: 'shop.view',
  SHOP_EDIT: 'shop.edit',

  // Sidebar menus: one key per page. A role without the key does not see the
  // menu, and the page's own endpoints answer 403 where they are guarded.
  MENU_DASHBOARD: 'menu.dashboard',
  MENU_USER_MANAGEMENT: 'menu.user_management',
  MENU_ROLE_PERMISSIONS: 'menu.role_permissions',
  MENU_SETTINGS: 'menu.settings',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  key: PermissionKey;
  group: string;
  description: string;
}

const P = PERMISSIONS;

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: P.USER_VIEW, group: 'user', description: 'View users' },
  { key: P.USER_CREATE, group: 'user', description: 'Create users' },
  {
    key: P.USER_EDIT,
    group: 'user',
    description: 'Edit users and reset their passwords',
  },
  { key: P.USER_DELETE, group: 'user', description: 'Delete users' },
  { key: P.SETTINGS_EDIT, group: 'settings', description: 'Edit app settings' },
  {
    key: P.CATEGORY_VIEW,
    group: 'category',
    description: 'View menu categories',
  },
  {
    key: P.CATEGORY_CREATE,
    group: 'category',
    description: 'Create menu categories',
  },
  {
    key: P.CATEGORY_EDIT,
    group: 'category',
    description: 'Edit and reorder menu categories',
  },
  {
    key: P.CATEGORY_DELETE,
    group: 'category',
    description: 'Delete menu categories',
  },
  { key: P.SHOP_VIEW, group: 'shop', description: 'View the shop profile' },
  {
    key: P.SHOP_EDIT,
    group: 'shop',
    description: 'Edit the shop profile, logo, currency and tax settings',
  },
  { key: P.MENU_DASHBOARD, group: 'menu', description: 'Dashboard menu' },
  {
    key: P.MENU_USER_MANAGEMENT,
    group: 'menu',
    description: 'User management menu',
  },
  {
    key: P.MENU_ROLE_PERMISSIONS,
    group: 'menu',
    description: 'Role permissions menu (admin roles only)',
  },
  { key: P.MENU_SETTINGS, group: 'menu', description: 'Settings menu' },
];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSION_CATALOG.map(
  (p) => p.key,
);

/** Keys only the admin roles may hold; refused for any other role. */
export const ADMIN_ONLY_KEYS: PermissionKey[] = [P.MENU_ROLE_PERMISSIONS];

/** Roles whose grants cannot be edited: they always hold every key. */
export const LOCKED_ROLES: Role[] = [...FULL_ACCESS_ROLES];

/**
 * Grants the seed writes for each role. The seed only adds rows, so grants
 * edited later through PUT /roles/:role/permissions are kept.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  [Role.ADMIN]: PERMISSION_KEYS,
  [Role.DEVELOPER]: PERMISSION_KEYS,
  [Role.MANAGER]: [
    P.USER_VIEW,
    P.USER_CREATE,
    P.USER_EDIT,
    P.SETTINGS_EDIT,
    P.CATEGORY_VIEW,
    P.CATEGORY_CREATE,
    P.CATEGORY_EDIT,
    P.CATEGORY_DELETE,
    P.SHOP_VIEW,
    P.SHOP_EDIT,
    P.MENU_DASHBOARD,
    P.MENU_USER_MANAGEMENT,
    P.MENU_SETTINGS,
  ],
  [Role.STAFF]: [P.MENU_DASHBOARD, P.CATEGORY_VIEW, P.SHOP_VIEW],
};
