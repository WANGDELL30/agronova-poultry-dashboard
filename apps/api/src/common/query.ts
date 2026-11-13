import { BadRequestException } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';

/**
 * Optional id from the query string. A repeated parameter arrives as an array and is rejected;
 * a blank value means "not given" (AUDIT H10).
 */
export const optionalIdQuery = z
  .string({ invalid_type_error: 'must be given once' })
  .trim()
  .optional()
  .transform((value) => value || undefined);

/** Decimal digits only: `0x10`, `1e2` and ` 10 ` are rejected (AUDIT R17). */
export function limitQuery(fallback: number, max: number) {
  const message = `limit must be an integer between 1 and ${max}`;
  return z
    .string({ invalid_type_error: message })
    .regex(/^\d+$/, message)
    .optional()
    .transform((value) => (value === undefined ? fallback : Number(value)))
    .pipe(z.number().int().min(1, message).max(max, message));
}

/** Parses `@Query()` with a Zod schema; any problem is a 400. */
export function parseQuery<T extends ZodTypeAny>(schema: T, query: unknown): z.output<T> {
  const parsed = schema.safeParse(query ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const name = issue?.path.join('.') || 'query';
    throw new BadRequestException(
      `Invalid query parameter ${name}: ${issue?.message ?? 'invalid'}.`,
    );
  }
  return parsed.data;
}
