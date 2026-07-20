import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { HealthTransformInterceptor } from '../interceptor';

export const HealthRouteMetadataKey = 'app:health-route';

export const Health = (): MethodDecorator =>
  applyDecorators(SetMetadata(HealthRouteMetadataKey, true), UseInterceptors(HealthTransformInterceptor));
