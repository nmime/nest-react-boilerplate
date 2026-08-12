import { ClientDataValidationException } from './exception';

/** Lower-cased header name, matching how Node and Fastify normalize inbound headers. */
export const IdempotencyKeyHeader = 'idempotency-key';
export const IdempotencyKeyMinLength = 8;
export const IdempotencyKeyMaxLength = 100;

/**
 * The single definition of a well-formed idempotency key. Every mutation route,
 * and every repository that stores the key as a uniqueness discriminator, tests
 * against this one pattern — a second copy is a second set of edge cases that
 * can disagree about what a replay of the same request looks like.
 */
export const idempotencyKeyPattern = new RegExp(
  `^[A-Za-z0-9:_-]{${IdempotencyKeyMinLength},${IdempotencyKeyMaxLength}}$`,
  'u',
);

export function isIdempotencyKey(value: string): boolean {
  return idempotencyKeyPattern.test(value);
}

/**
 * Validates the raw `Idempotency-Key` header value.
 *
 * A repeated header arrives as an array; picking one value would let a client
 * decide which request a replay is compared against, so it is rejected outright.
 */
export function requireIdempotencyKey(value: string | readonly string[] | undefined): string {
  if (typeof value === 'string' && isIdempotencyKey(value)) {
    return value;
  }

  throw new ClientDataValidationException([
    {
      detail: `${IdempotencyKeyHeader} header is not a valid idempotency key.`,
      pointer: `#/headers/${IdempotencyKeyHeader}`,
    },
  ]);
}
