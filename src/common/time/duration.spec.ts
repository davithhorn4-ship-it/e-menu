import { parseDurationMs } from './duration';

describe('parseDurationMs', () => {
  it.each([
    ['900', 900_000],
    ['30s', 30_000],
    ['15m', 900_000],
    ['8h', 28_800_000],
    [' 7D ', 604_800_000],
  ])('%p -> %p ms', (input, expected) => {
    expect(parseDurationMs(input, -1)).toBe(expected);
  });

  it.each([undefined, null, '', '1w', '2 days', 'abc'])(
    'falls back for %p',
    (input) => {
      expect(parseDurationMs(input, 42)).toBe(42);
    },
  );
});
