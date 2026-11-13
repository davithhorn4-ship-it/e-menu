import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { invalidateAuthUserOnWrite } from 'src/common/strategy/auth-user-cache';

function getPrismaClientOptions(): Prisma.PrismaClientOptions {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize PrismaClient');
  }

  if (
    databaseUrl.startsWith('prisma://') ||
    databaseUrl.startsWith('prisma+postgres://')
  ) {
    return { accelerateUrl: databaseUrl };
  }

  return {
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(getPrismaClientOptions());
    // Every write to `user` (role, password, delete, tokens), including inside
    // interactive transactions, drops that user from the auth cache.
    return this.$extends({
      name: 'auth-user-cache-invalidation',
      query: { user: { $allOperations: invalidateAuthUserOnWrite } },
    }) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
