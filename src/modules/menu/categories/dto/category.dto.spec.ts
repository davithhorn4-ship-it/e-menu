import { ValidationPipe } from '@nestjs/common';

import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './category.dto';

// Same options as the global pipe in src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = <T>(
  metatype: new () => T,
  value: unknown,
  type: 'body' | 'query' = 'body',
) => pipe.transform(value, { type, metatype }) as Promise<T>;

describe('Category DTOs', () => {
  it('trims the names', async () => {
    const dto = await parse(CreateCategoryDto, {
      name: '  Coffee ',
      nameKm: ' កាហ្វេ ',
    });
    expect(dto).toMatchObject({ name: 'Coffee', nameKm: 'កាហ្វេ' });
  });

  it('refuses an empty or too long name', async () => {
    await expect(parse(CreateCategoryDto, { name: '   ' })).rejects.toThrow();
    await expect(
      parse(CreateCategoryDto, { name: 'x'.repeat(81) }),
    ).rejects.toThrow();
    await expect(parse(CreateCategoryDto, {})).rejects.toThrow();
  });

  it('refuses isActive "false" as text and a negative sortOrder', async () => {
    await expect(
      parse(CreateCategoryDto, { name: 'Tea', isActive: 'false' }),
    ).rejects.toThrow();
    await expect(
      parse(CreateCategoryDto, { name: 'Tea', sortOrder: -1 }),
    ).rejects.toThrow();
    await expect(
      parse(CreateCategoryDto, { name: 'Tea', sortOrder: 1.5 }),
    ).rejects.toThrow();
  });

  it('lets an update send only one field', async () => {
    const dto = await parse(UpdateCategoryDto, { isActive: false });
    expect(dto.isActive).toBe(false);
    expect(dto.name).toBeUndefined();
  });

  it('reads ?isActive=false as false', async () => {
    const dto = await parse(
      ListCategoriesQueryDto,
      { isActive: 'false' },
      'query',
    );
    expect(dto.isActive).toBe(false);
  });

  it('needs unique UUIDs to reorder', async () => {
    const a = '6f1c2b1e-1d2a-4c3b-9a8e-111111111111';
    await expect(parse(ReorderCategoriesDto, { ids: [a] })).resolves.toEqual({
      ids: [a],
    });
    await expect(parse(ReorderCategoriesDto, { ids: [] })).rejects.toThrow();
    await expect(
      parse(ReorderCategoriesDto, { ids: [a, a] }),
    ).rejects.toThrow();
    await expect(
      parse(ReorderCategoriesDto, { ids: ['nope'] }),
    ).rejects.toThrow();
  });
});
