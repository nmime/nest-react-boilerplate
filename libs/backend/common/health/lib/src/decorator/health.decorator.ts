import { SetMetadata } from "@nestjs/common";

export const HealthRouteMetadataKey = "app:health-route";

export const Health = (): MethodDecorator =>
  SetMetadata(HealthRouteMetadataKey, true);
