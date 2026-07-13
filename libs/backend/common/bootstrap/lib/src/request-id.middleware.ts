import { requestContext } from './request-context';

/**
 * CLS middleware — enters AsyncLocalStorage context for each request.
 *
 * Pattern (same as xrocket's nestjs-cls middleware):
 *  - Reads x-request-id from client header if present, otherwise generates UUID
 *  - Enters CLS context so all async downstream code shares the same requestId
 *  - Sets x-request-id on response header
 *
 * IMPORTANT: Fastify's onSend hook keeps CLS alive through async handlers.
 * MUST be registered as first middleware (before logging, locale, etc.)
 */
export function createClsMiddleware(
  headerName: string = 'x-request-id',
) {
  return (
    request: RequestLike,
    response: ResponseLike,
    next: NextFunctionLike,
  ) => {
    // Read client-provided requestId or generate new one
    const clientHeader = request.headers?.[headerName] ?? request.headers?.[headerName.toLowerCase()];
    const existingId = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;

    // Enter CLS context — all async operations downstream inherit requestId
    requestContext.run(() => {
      response.setHeader(headerName, requestContext.getRequestId() ?? '');
      next();
    }, existingId);
  };
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

interface NextFunctionLike {
  (): void;
}
