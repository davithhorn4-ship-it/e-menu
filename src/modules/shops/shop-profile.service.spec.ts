/* eslint-disable */
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ShopProfileService } from './shop-profile.service';

const SHOP = 'shop-1';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: SHOP,
  name: 'My Restaurant',
  nameKm: '',
  logoUrl: null as string | null,
  defaultLanguage: 'km',
  baseCurrency: 'USD',
  showSecondCurrency: true,
  exchangeRate: 4100,
  taxPercent: new Prisma.Decimal(10),
  servicePercent: new Prisma.Decimal('2.5'),
  pricesIncludeTax: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ShopProfileService', () => {
  let prisma: any;
  let storage: any;
  let service: ShopProfileService;
  let current: ReturnType<typeof row>;

  beforeEach(() => {
    current = row();
    prisma = {
      shop: {
        findUniqueOrThrow: jest.fn(() => Promise.resolve(current)),
        // Like Prisma: undefined fields are left unchanged.
        update: jest.fn(({ data }) =>
          Promise.resolve({
            ...current,
            ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
          }),
        ),
      },
    };
    storage = {
      save: jest.fn().mockResolvedValue('/uploads/shops/new.png'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const shops = { currentShopId: jest.fn().mockResolvedValue(SHOP) };
    service = new ShopProfileService(prisma, shops as any, storage);
  });

  it('returns the current shop with percentages as numbers', async () => {
    const profile = await service.get();
    expect(prisma.shop.findUniqueOrThrow.mock.calls[0][0].where).toEqual({ id: SHOP });
    expect(profile.taxPercent).toBe(10);
    expect(profile.servicePercent).toBe(2.5);
  });

  it('updates only the sent fields', async () => {
    await service.update({ exchangeRate: 4000 });
    const { data, where } = prisma.shop.update.mock.calls[0][0];
    expect(where).toEqual({ id: SHOP });
    expect(data.exchangeRate).toBe(4000);
    expect(data.name).toBeUndefined();
    expect('logoUrl' in data).toBe(false);
  });

  it('accepts the whole form with the current uploaded logo unchanged', async () => {
    current = row({ logoUrl: '/uploads/shops/old.png' });
    await service.update({ name: 'Cafe', logoUrl: '/uploads/shops/old.png' });
    expect('logoUrl' in prisma.shop.update.mock.calls[0][0].data).toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('refuses a new logoUrl that is not an http(s) link', async () => {
    await expect(service.update({ logoUrl: '/uploads/users/someone.png' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update({ logoUrl: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it('clearing the logo deletes the old uploaded file', async () => {
    current = row({ logoUrl: '/uploads/shops/old.png' });
    const profile = await service.update({ logoUrl: null });
    expect(profile.logoUrl).toBeNull();
    expect(storage.remove).toHaveBeenCalledWith('/uploads/shops/old.png');
  });

  it('stores an uploaded PNG logo and removes the previous one', async () => {
    current = row({ logoUrl: '/uploads/shops/old.png' });
    const profile = await service.setLogo({ buffer: PNG });
    expect(storage.save).toHaveBeenCalledWith('shops', PNG, 'png');
    expect(profile.logoUrl).toBe('/uploads/shops/new.png');
    expect(storage.remove).toHaveBeenCalledWith('/uploads/shops/old.png');
  });

  it('rejects a missing, too large or non-image logo', async () => {
    await expect(service.setLogo(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setLogo({ buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(service.setLogo({ buffer: Buffer.from('<svg></svg>') })).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('deletes the saved file when the database update fails', async () => {
    prisma.shop.update.mockRejectedValueOnce(new Error('db down'));
    await expect(service.setLogo({ buffer: PNG })).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledWith('/uploads/shops/new.png');
  });

  it('removeLogo clears logoUrl and deletes the file', async () => {
    current = row({ logoUrl: '/uploads/shops/old.png' });
    const profile = await service.removeLogo();
    expect(profile.logoUrl).toBeNull();
    expect(storage.remove).toHaveBeenCalledWith('/uploads/shops/old.png');
  });
});
