import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IdempotencyKeyHeader, IdempotencyKeyMaxLength, IdempotencyKeyMinLength, requireIdempotencyKey } from '../idempotency';

interface HeaderCarrier {
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Injects the validated `Idempotency-Key` header, rejecting the request when it
 * is absent or malformed. Every mutation route shares this one validator instead
 * of restating the pattern beside each handler.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<HeaderCarrier>();

  return requireIdempotencyKey(request.headers?.[IdempotencyKeyHeader]);
});

/** Documents the header the `@IdempotencyKey()` parameter requires. */
export const ApiIdempotencyKey = (): MethodDecorator & ClassDecorator =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Caller-generated key that makes this mutation replay-safe. ' +
      `${IdempotencyKeyMinLength}-${IdempotencyKeyMaxLength} characters from A-Z a-z 0-9 : _ -`,
  });
