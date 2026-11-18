import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { issuedBeforePasswordChange } from './auth-user-lookup';
import { makeAccessTokenCheck, selectAccessToken } from './access-token';

const secret = 'test-secret-1234567890';
const jwt = new JwtService({ secret });
const access = (sub: string) =>
  jwt.sign({ sub, tokenType: 'access' }, { expiresIn: 60 });
const isValid = makeAccessTokenCheck(secret);

const req = (bearer?: string, cookie?: string) =>
  ({
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    cookies: cookie ? { accessToken: cookie } : {},
  }) as unknown as Request;

describe('makeAccessTokenCheck', () => {
  it('accepts a valid access token', () => {
    expect(isValid(access('u1'))).toBe(true);
  });

  it('refuses garbage, other secrets, refresh and expired tokens', () => {
    expect(isValid('abc.def.ghi')).toBe(false);
    expect(
      isValid(
        new JwtService({ secret: 'other' }).sign({ tokenType: 'access' }),
      ),
    ).toBe(false);
    expect(isValid(jwt.sign({ tokenType: 'refresh' }))).toBe(false);
    expect(isValid(jwt.sign({ tokenType: 'access' }, { expiresIn: -10 }))).toBe(
      false,
    );
  });
});

describe('selectAccessToken', () => {
  const good = access('u1');
  const goodCookie = access('u2');

  it('uses the Bearer token when it is the only one', () => {
    expect(selectAccessToken(req(good), isValid)).toBe(good);
  });

  it('uses the cookie when it is the only one', () => {
    expect(selectAccessToken(req(undefined, good), isValid)).toBe(good);
  });

  it('prefers a valid Bearer token over the cookie', () => {
    expect(selectAccessToken(req(good, goodCookie), isValid)).toBe(good);
  });

  it('falls back to a valid cookie when the Bearer token is bad', () => {
    expect(selectAccessToken(req('abc.def.ghi', goodCookie), isValid)).toBe(
      goodCookie,
    );
  });

  it('keeps the bad Bearer token when the cookie is bad too', () => {
    expect(selectAccessToken(req('abc.def.ghi', 'x.y.z'), isValid)).toBe(
      'abc.def.ghi',
    );
  });

  it('returns null without any token', () => {
    expect(selectAccessToken(req(), isValid)).toBeNull();
  });
});

describe('issuedBeforePasswordChange', () => {
  const changedAt = new Date('2026-11-17T10:00:00.700Z');
  const sec = Math.floor(changedAt.getTime() / 1000);

  it('refuses a token issued in an earlier second', () => {
    expect(issuedBeforePasswordChange(sec - 1, changedAt)).toBe(true);
  });

  it('accepts a token issued in the same second (login right after reset)', () => {
    expect(issuedBeforePasswordChange(sec, changedAt)).toBe(false);
  });

  it('accepts a later token, or when the password never changed', () => {
    expect(issuedBeforePasswordChange(sec + 1, changedAt)).toBe(false);
    expect(issuedBeforePasswordChange(sec, null)).toBe(false);
    expect(issuedBeforePasswordChange(undefined, changedAt)).toBe(false);
  });
});
