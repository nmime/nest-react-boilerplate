import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { requestContext } from './request-context';

/**
 * CLS interceptor — wraps every request handler in AsyncLocalStorage context.
 *
 * Pattern (same as xrocket's nestjs-cls interceptor):
 *  - Reads x-request-id from client header if present, otherwise generates UUID
 *  - Wraps entire async handler execution in CLS context via Observable tap
 *  - Sets x-request-id on response header
 *
 * Registered globally via app.useGlobalInterceptors().
 */
@Injectable()
export class ClsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Read client-provided requestId or let CLS generate one
    const headerName = 'x-request-id';
    const clientHeader = request.headers?.[headerName] ?? request.headers?.[headerName.toLowerCase()];
    const existingId = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;

    // Enter CLS context — requestId is now available to all async downstream code
    return requestContext.run(() => {
      response.setHeader?.(headerName, requestContext.getRequestId() ?? '');
      return next.handle().pipe(
        tap({
          finalize: () => {
            // CLS context naturally unwinds here
          },
        }),
      );
    }, existingId);
  }
}
