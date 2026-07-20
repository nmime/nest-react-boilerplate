import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { HealthHttpStatus } from '../const';
import type { HealthResponse, HealthResponseDto, HealthStatus } from '../dto';

interface HealthStatusResponse {
  status(code: number): unknown;
}

@Injectable()
export class HealthTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<HealthResponse | HealthResponseDto> {
    const response = context.switchToHttp().getResponse<HealthStatusResponse>();
    return next.handle().pipe(
      map((value: HealthResponse | HealthResponseDto) => {
        response.status(HealthHttpStatus[readHealthStatus(value)]);
        return value;
      }),
    );
  }
}

function readHealthStatus(value: HealthResponse | HealthResponseDto): HealthStatus {
  return 'data' in value ? value.data.status : value.status;
}
