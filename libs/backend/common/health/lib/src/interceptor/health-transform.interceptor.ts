import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { HealthResponse } from "../dto";

@Injectable()
export class HealthTransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<HealthResponse> {
    return next.handle().pipe(map((value: HealthResponse) => value));
  }
}
