import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register --transpile-only --project tsconfig.seed.json prisma/seed.ts',
  },
  datasource: {
    // Read without env() so `prisma generate` also works with no database
    // configured (fresh clone, Docker build).
    url: process.env.DATABASE_URL ?? '',
  },
});
