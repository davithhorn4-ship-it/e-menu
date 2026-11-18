import { Transform } from 'class-transformer';

/**
 * Optional text fields: an empty or blank string means "not set" (null), so
 * an empty form input or a cleared Swagger field is accepted instead of
 * failing validation (e.g. "photoUrl must be a URL address").
 * Other values are passed through untouched for the validators.
 */
export const EmptyToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );
