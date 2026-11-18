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
  fullName: 'Sok Dara',
  email: 'dara@example.com',
  password: 'password123',
};

describe('Optional user text fields', () => {
  it('creates a user without photoUrl or phone', async () => {
    const dto = await parse(CreateUserDto, base);
    expect(dto.photoUrl).toBeUndefined();
    expect(dto.phone).toBeUndefined();
  });

  it('treats empty photoUrl and phone as not set on create', async () => {
    const dto = await parse(CreateUserDto, {
      ...base,
      photoUrl: '',
      phone: '  ',
    });
    expect(dto.photoUrl).toBeNull();
    expect(dto.phone).toBeNull();
  });

  it('clears photoUrl and phone with an empty value on update', async () => {
    const dto = await parse(UpdateUserDto, { photoUrl: '', phone: '' });
    expect(dto.photoUrl).toBeNull();
    expect(dto.phone).toBeNull();
  });

  it('still refuses a photoUrl that is not a URL', async () => {
    await expect(
      parse(CreateUserDto, { ...base, photoUrl: 'not a url' }),
    ).rejects.toThrow();
    await expect(
      parse(UpdateUserDto, { photoUrl: 'string' }),
    ).rejects.toThrow();
  });

  it('accepts a real photo URL', async () => {
    const dto = await parse(CreateUserDto, {
      ...base,
      photoUrl: 'https://cdn.example.com/u/dara.png',
    });
    expect(dto.photoUrl).toBe('https://cdn.example.com/u/dara.png');
  });
});
