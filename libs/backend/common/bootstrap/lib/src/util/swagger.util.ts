import type { INestApplication } from "@nestjs/common";
import { setupSwagger } from "@app/backend/common/swagger";
import type { SetupSwaggerOptions } from "@app/backend/common/swagger";

export type SwaggerConfig = SetupSwaggerOptions;

export function setupBootstrapSwagger(
  app: INestApplication,
  config: SwaggerConfig,
): void {
  setupSwagger(app, config);
}
