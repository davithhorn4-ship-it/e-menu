/* eslint-disable */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CategoriesService } from './categories.service';

const SHOP = 'shop-1';
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-1',
  name: 'Coffee',
  nameKm: 'កាហ្វេ',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CategoriesService', () => {
  let prisma: any;
  let service: CategoriesService;

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([row()]),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
        create: jest.fn(({ data }) => Promise.resolve(row(data))),
        update: jest.fn(({ data }) => Promise.resolve(row(data))),
        delete: jest.fn().mockResolvedValue({ id: 'c-1' }),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    const shops = { currentShopId: jest.fn().mockResolvedValue(SHOP) };
    service = new CategoriesService(prisma, shops as any);
  });

  it('lists only the current shop, in menu order', async () => {
    await service.list({ search: 'cof', isActive: true });
    const args = prisma.category.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ shopId: SHOP, isActive: true });
    expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
  });

  it('answers 404 for an id of another shop (scoped lookup)', async () => {
    await expect(service.get('other-shop-cat')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.category.findFirst.mock.calls[0][0].where).toEqual({ id: 'other-shop-cat', shopId: SHOP });
  });

  it('creates after the last category by default', async () => {
    await service.create({ name: 'Tea' });
    expect(prisma.category.create.mock.calls[0][0].data).toMatchObject({
      shopId: SHOP, name: 'Tea', nameKm: '', sortOrder: 5, isActive: true,
    });
  });

  it('starts at 0 in an empty shop', async () => {
    prisma.category.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    await service.create({ name: 'Tea' });
    expect(prisma.category.create.mock.calls[0][0].data.sortOrder).toBe(0);
  });

  it('refuses a duplicate name, ignoring case', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'c-9' });
    await expect(service.create({ name: 'COFFEE' })).rejects.toMatchObject({
      response: { code: 'CATEGORY_NAME_TAKEN' },
    });
    expect(prisma.category.findFirst.mock.calls[0][0].where.name).toEqual({ equals: 'COFFEE', mode: 'insensitive' });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('maps a race on the unique index to CATEGORY_NAME_TAKEN', async () => {
    prisma.category.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.create({ name: 'Tea' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only the sent fields and allows keeping its own name', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(row()); // get()
    await service.update('c-1', { name: 'Coffee', isActive: false });
    expect(prisma.category.update.mock.calls[0][0].data).toEqual({ name: 'Coffee', isActive: false });
    expect(prisma.category.findFirst).toHaveBeenCalledTimes(1); // no name check for the same name
  });

  it('checks the new name against the other categories on rename', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce({ id: 'c-2' });
    await expect(service.update('c-1', { name: 'Tea' })).rejects.toMatchObject({
      response: { code: 'CATEGORY_NAME_TAKEN' },
    });
    expect(prisma.category.findFirst.mock.calls[1][0].where.NOT).toEqual({ id: 'c-1' });
  });

  it('reorders the listed ids to 0, 1, 2…', async () => {
    prisma.category.findMany
      .mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }])
      .mockResolvedValueOnce([row()]);
    await service.reorder(['b', 'a']);
    expect(prisma.category.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data.sortOrder])).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('refuses to reorder ids that are not in this shop', async () => {
    prisma.category.findMany.mockResolvedValueOnce([{ id: 'a' }]);
    await expect(service.reorder(['a', 'x'])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('answers 409 CATEGORY_IN_USE when products still reference it', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(row());
    prisma.category.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    await expect(service.remove('c-1')).rejects.toMatchObject({ response: { code: 'CATEGORY_IN_USE' } });
  });
});
