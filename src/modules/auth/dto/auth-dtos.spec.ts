import { ValidationPipe } from '@nestjs/common';

import { LoginDto } from './login.dto';
import { RefreshTokenDto } from './refresh-token.dto';

// Same options as the global pipe in src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = <T>(metatype: new () => T, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

describe('LoginDto', () => {
  it('trims the email before validating it', async () => {
    const dto = await parse(LoginDto, {
      email: '  dev@e-menu.test  ',
      password: 'password-123',
    });
    expect(dto.email).toBe('dev@e-menu.test');
  });

  it('still refuses an invalid email', async () => {
    await expect(
      parse(LoginDto, { email: ' nope ', password: 'password-123' }),
    ).rejects.toThrow();
  });
});

describe('RefreshTokenDto', () => {
  it('accepts an empty body (token comes from the cookie)', async () => {
    await expect(parse(RefreshTokenDto, undefined)).resolves.toEqual({});
    await expect(parse(RefreshTokenDto, {})).resolves.toEqual({});
  });

  it('accepts a token string', async () => {
    const dto = await parse(RefreshTokenDto, { refreshToken: 'a.b.c' });
    expect(dto.refreshToken).toBe('a.b.c');
  });

  it('refuses unknown fields, empty and non-string tokens', async () => {
    await expect(
      parse(RefreshTokenDto, { refreshToken: 'a.b.c', hack: true }),
    ).rejects.toThrow();
    await expect(
      parse(RefreshTokenDto, { refreshToken: '' }),
    ).rejects.toThrow();
    await expect(
      parse(RefreshTokenDto, { refreshToken: { a: 1 } }),
    ).rejects.toThrow();
  });
});
