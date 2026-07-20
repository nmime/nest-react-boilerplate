import { normalizeRequestId, requestContext } from '@app/backend-common-request-context';

function stripLoggedRequestPath(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  // Drop the query string: secrets (password-reset tokens, OAuth codes, ...) are
  // routinely passed as query parameters and must never be written to logs.
  const queryIndex = path.indexOf('?');
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function createRequestLoggingMiddleware(appName: string) {
  return (request: RequestLike, response: ResponseLike, next: NextFunctionLike) => {
    const incomingRequestId = normalizeRequestId(request.headers?.['x-request-id']);

    requestContext.run(() => {
      const startedAt = Date.now();
      const requestId = requestContext.getRequestId();
      response.setHeader?.('x-request-id', requestId ?? '');
      // Propagate the resolved id back onto the request so the downstream Nest
      // ClsInterceptor adopts it instead of minting a fresh one — keeping the
      // access log, the response x-request-id header, and application logs
      // stamped with a single, correlatable request id.
      if (requestId) {
        request.headers ??= {};
        request.headers['x-request-id'] = requestId;
      }

      response.on('finish', () => {
        /* v8 ignore next -- some adapters expose only one URL-like request field. */
        const requestPath = request.originalUrl ?? request.url ?? request.path;
        const logEntry = {
          appName,
          durationMs: Date.now() - startedAt,
          method: request.method,
          path: stripLoggedRequestPath(requestPath),
          requestId,
          status: response.statusCode,
        };
        process.stdout.write(`${JSON.stringify(logEntry)}\n`);
      });

      next();
    }, incomingRequestId);
  };
}

export { createRequestLoggingMiddleware };

interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  statusCode?: number;
  on: (event: 'finish', listener: () => void) => void;
  setHeader?: (name: string, value: string) => unknown;
}

interface NextFunctionLike {
  (): void;
}
