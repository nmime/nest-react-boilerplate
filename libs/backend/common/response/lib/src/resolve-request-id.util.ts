import type { ProblemDetails } from '@app/backend-common-exception';

/**
 * Read the requestId that was set by the bootstrap requestId middleware.
 *
 * Contract: the bootstrap pipeline registers `createRequestIdMiddleware` FIRST,
 * which sets `x-request-id` on the response header. All downstream consumers
 * call this function to get the SAME id.
 */
export function resolveRequestId(
  response: { getHeader?(name: string): unknown },
  headerName = 'x-request-id',
): string {
  const fromResponse = response.getHeader?.(headerName);
  if (typeof fromResponse === 'string' && fromResponse.trim() !== '') {
    return fromResponse;
  }

  // Fallback — should never happen when middleware is registered
  return `req_${Date.now()}`;
}
