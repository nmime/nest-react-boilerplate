import { randomUUID } from 'node:crypto';

/**
 * Request ID middleware — single source of truth for requestId.
 *
 * Reads `x-request-id` from incoming header; if absent, generates a UUID.
 * Sets it on the response header so all downstream modules (logger, filter,
 * controllers) read the SAME id.
 *
 * MUST be registered before any other middleware that uses requestId.
 */
export function createRequestIdMiddleware(
  headerName: string = 'x-request-id',
): (req: RequestLike, res: ResponseLike, next: () => void) => void {
  return (request, response, next) => {
    const existing = request.headers?.[headerName] ?? request.headers?.[headerName.toLowerCase()];
    const requestId = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    response.setHeader(headerName, requestId);
    next();
  };
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}
