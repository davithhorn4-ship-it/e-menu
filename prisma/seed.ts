import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
} from '../src/modules/permissions/permission-catalog';

/**
 * Minimal seed: the permission catalog, the default role grants and one
 * ADMIN account. Only adds rows; running it again changes nothing that
 * exists (an existing admin keeps its password).
 *
 * The admin comes from the environment, nothing is hard-coded:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (min 12 chars), SEED_ADMIN_NAME (optional)
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to run the seed`);
  return value;
}

const databaseUrl = required('DATABASE_URL');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedPermissions() {
  await prisma.permission.createMany({
    data: PERMISSION_CATALOG,
    skipDuplicates: true,
  });
  await prisma.rolePermission.createMany({
    data: Object.values(Role).flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role].map((permissionKey) => ({
        role,
        permissionKey,
      })),
    ),
    skipDuplicates: true,
  });
}

async function seedAdmin() {
  const email = required('SEED_ADMIN_EMAIL').toLowerCase();
  const password = required('SEED_ADMIN_PASSWORD');
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }
  const fullName = process.env.SEED_ADMIN_NAME?.trim() || 'Administrator';

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    console.log(`Admin ${email} already exists; left unchanged.`);
    return;
  }

  await prisma.user.create({
    data: {
      fullName,
      email,
      role: Role.ADMIN,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      }),
    },
  });
  console.log(`Admin ${email} created.`);
}

async function main() {
  await seedPermissions();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
