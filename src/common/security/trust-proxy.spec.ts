import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', 1],
    [' 2 ', 2],
    ['loopback', 'loopback'],
    ['10.0.0.0/8,127.0.0.1', '10.0.0.0/8,127.0.0.1'],
  ])('%p -> %p', (input, expected) => {
    expect(parseTrustProxy(input)).toBe(expected);
  });
});
