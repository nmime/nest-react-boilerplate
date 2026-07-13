import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestContext } from './request-context';

/**
 * CLS interceptor — wraps every request in AsyncLocalStorage context.
 *
 * Pattern: same as xrocket's nestjs-cls middleware but as a NestJS interceptor
 * so the entire async handler chain (controllers + services) inherits the context.
 *
 * Reads client x-request-id if present, otherwise generates UUID. Sets it on
 * response header. All downstream code reads from CLS via requestContext.
 */
@Injectable()
export class ClsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const headerName = 'x-request-id';
    const clientHeader = request.headers?.[headerName] ?? request.headers?.[headerName.toLowerCase()];
    const existingId = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;

    return requestContext.run(() => {
      response.setHeader?.(headerName, requestContext.getRequestId() ?? '');
      return next.handle();
    }, existingId);
  }
}
