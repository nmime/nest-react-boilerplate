import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { catchError, map, throwError, type Observable } from "rxjs";
import { mapValueToApiResponse } from "./response";

@Injectable()
export class ProblemResponseTransformer implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => mapValueToApiResponse(value)),
      catchError((error: unknown) => throwError(() => error)),
    );
  }
}
