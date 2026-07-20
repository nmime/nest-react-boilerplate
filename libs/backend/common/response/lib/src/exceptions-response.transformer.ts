import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { catchError, map, throwError, type Observable } from 'rxjs';
import type { Result } from 'neverthrow';
import { mapValueToApiResponse } from './response';

const isNeverthrowResult = (value: unknown): value is Result<unknown, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { isOk?: unknown }).isOk === 'function' &&
  typeof (value as { isErr?: unknown }).isErr === 'function';

@Injectable()
export class ExceptionsResponseTransformer implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        // Failing Results must surface through the exception filter so the reply
        // carries the RFC 9457 status and application/problem+json content-type.
        // Returning the mapped problem body here would ship it as HTTP 200 because
        // Nest applies the route's default status to interceptor return values.
        if (isNeverthrowResult(value) && value.isErr()) {
          throw value.error;
        }

        return mapValueToApiResponse(value);
      }),
      catchError((error: unknown) => throwError(() => error)),
    );
  }
}
