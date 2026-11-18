/* eslint-disable */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateShopProfileDto } from './update-shop-profile.dto';

/** Same options as the global ValidationPipe. */
const check = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateShopProfileDto, body, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, fields: errors.map((e) => e.property) };
};

describe('UpdateShopProfileDto', () => {
  it('accepts the full form from /shop/profile', async () => {
    const { fields, dto } = await check({
      name: ' My Cafe ',
      nameKm: 'ហាង',
      logoUrl: '',
      defaultLanguage: 'en',
      baseCurrency: 'KHR',
      showSecondCurrency: false,
      exchangeRate: 4100,
      taxPercent: 10,
      servicePercent: 2.5,
      pricesIncludeTax: true,
    });
    expect(fields).toEqual([]);
    expect(dto.name).toBe('My Cafe');
    expect(dto.logoUrl).toBeNull();
    expect(dto.showSecondCurrency).toBe(false);
  });

  it('rejects text booleans and numbers instead of converting them', async () => {
    const { fields } = await check({ pricesIncludeTax: 'false', exchangeRate: '4100' });
    expect(fields.sort()).toEqual(['exchangeRate', 'pricesIncludeTax']);
  });

  it('rejects out-of-range money settings', async () => {
    const { fields } = await check({ exchangeRate: 0, taxPercent: 101, servicePercent: 1.234 });
    expect(fields.sort()).toEqual(['exchangeRate', 'servicePercent', 'taxPercent']);
  });

  it('rejects an empty name, unknown language or currency', async () => {
    const { fields } = await check({ name: '  ', defaultLanguage: 'fr', baseCurrency: 'EUR' });
    expect(fields.sort()).toEqual(['baseCurrency', 'defaultLanguage', 'name']);
  });

  it('rejects unknown fields such as isActive or id', async () => {
    const { fields } = await check({ isActive: false, id: 'x' });
    expect(fields.sort()).toEqual(['id', 'isActive']);
  });
});
