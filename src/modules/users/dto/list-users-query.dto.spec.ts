import { ValidationPipe } from '@nestjs/common';

import { ListUsersQueryDto } from './list-users-query.dto';

// Same options as the global pipe in src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = (query: Record<string, string>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: ListUsersQueryDto,
  }) as Promise<ListUsersQueryDto>;

describe('ListUsersQueryDto', () => {
  it('parses isActive=false as false', async () => {
    expect((await parse({ isActive: 'false' })).isActive).toBe(false);
  });

  it('parses isActive=true as true', async () => {
    expect((await parse({ isActive: 'true' })).isActive).toBe(true);
  });

  it('leaves isActive undefined when absent', async () => {
    expect((await parse({})).isActive).toBeUndefined();
  });

  it('rejects other isActive values', async () => {
    await expect(parse({ isActive: 'yes' })).rejects.toThrow();
  });

  it('applies page and limit defaults', async () => {
    const dto = await parse({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});
