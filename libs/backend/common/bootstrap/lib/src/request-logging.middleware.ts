import { normalizeRequestId, requestContext } from '@app/backend-common-request-context';

function createRequestLoggingMiddleware(appName: string) {
  return (request: RequestLike, response: ResponseLike, next: NextFunctionLike) => {
    const incomingRequestId = normalizeRequestId(request.headers?.['x-request-id']);

    requestContext.run(() => {
      const startedAt = Date.now();
      const requestId = requestContext.getRequestId();
      response.setHeader?.('x-request-id', requestId ?? '');

      response.on('finish', () => {
        const logEntry = {
          appName,
          durationMs: Date.now() - startedAt,
          method: request.method,
          /* v8 ignore next -- some adapters expose only one URL-like request field. */
          path: request.originalUrl ?? request.url ?? request.path,
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
