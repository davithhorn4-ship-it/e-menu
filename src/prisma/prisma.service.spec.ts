import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    // Never connected in this test; the adapter connects lazily.
    process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/unused';
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it('returns the extended client with Nest lifecycle hooks and models', () => {
    const prisma = new PrismaService();

    expect(typeof prisma.onModuleInit).toBe('function');
    expect(typeof prisma.onModuleDestroy).toBe('function');
    expect(typeof prisma.user.update).toBe('function');
    expect(typeof prisma.$transaction).toBe('function');
  });
});
