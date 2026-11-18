import { ValidationPipe } from '@nestjs/common';

import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

// Same options as the global pipe in src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = <T>(metatype: new () => T, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

const base = {
  fullName: 'Loc',
  email: 'loc@example.com',
  password: 'password123',
};

describe('User location fields', () => {
  it('accepts address and coordinates on create', async () => {
    const dto = await parse(CreateUserDto, {
      ...base,
      address: 'Phnom Penh',
      latitude: 11.5564,
      longitude: 104.9282,
    });
    expect(dto).toMatchObject({
      address: 'Phnom Penh',
      latitude: 11.5564,
      longitude: 104.9282,
    });
  });

  it('refuses coordinates out of range or sent as text', async () => {
    await expect(
      parse(CreateUserDto, { ...base, latitude: 91, longitude: 0 }),
    ).rejects.toThrow();
    await expect(
      parse(CreateUserDto, { ...base, latitude: 0, longitude: 181 }),
    ).rejects.toThrow();
    await expect(
      parse(CreateUserDto, { ...base, latitude: '11.5', longitude: 104 }),
    ).rejects.toThrow();
  });

  it('keeps null as null on update (clears instead of becoming 0)', async () => {
    const dto = await parse(UpdateUserDto, {
      latitude: null,
      longitude: null,
      address: null,
    });
    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
    expect(dto.address).toBeNull();
  });

  it('inherits the location rules on update', async () => {
    await expect(
      parse(UpdateUserDto, { latitude: -100, longitude: 0 }),
    ).rejects.toThrow();
    await expect(
      parse(UpdateUserDto, { address: 'x'.repeat(301) }),
    ).rejects.toThrow();
  });
});
