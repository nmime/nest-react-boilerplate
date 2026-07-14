import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { normalizeRequestId, requestContext } from '@app/backend-common-request-context';

interface HttpRequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

interface HttpResponseLike {
  header?(name: string, value: string): unknown;
  raw?: {
    setHeader?(name: string, value: string): unknown;
  };
  setHeader?(name: string, value: string): unknown;
}

function setResponseHeader(response: HttpResponseLike, name: string, value: string): void {
  if (response.header) {
    response.header(name, value);
    return;
  }

  if (response.setHeader) {
    response.setHeader(name, value);
    return;
  }

  response.raw?.setHeader?.(name, value);
}

/**
 * CLS interceptor — wraps every request in AsyncLocalStorage context.
 *
 * Implemented as a NestJS interceptor around Node AsyncLocalStorage
 * so the entire async handler chain (controllers + services) inherits the context.
 *
 * Reads client x-request-id if present, otherwise generates UUID. Sets it on
 * response header. All downstream code reads from CLS via requestContext.
 */
@Injectable()
export class ClsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const response = context.switchToHttp().getResponse<HttpResponseLike>();

    const headerName = 'x-request-id';
    const clientHeader = request.headers?.[headerName] ?? request.headers?.[headerName.toLowerCase()];
    const existingId = normalizeRequestId(clientHeader) ?? requestContext.getRequestId();

    return requestContext.run(() => {
      setResponseHeader(response, headerName, requestContext.getRequestId() ?? '');
      return next.handle();
    }, existingId);
  }
}
