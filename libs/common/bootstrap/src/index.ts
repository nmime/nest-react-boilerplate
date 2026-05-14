import type { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { createProblemValidationPipe } from "@app/common/validation";

export interface BootstrapNestApiOptions {
  appName: string;
  defaultPort: number;
  enableCors?: boolean;
  corsOrigins?: string[];
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function resolveConfiguredCorsOrigins(
  options: BootstrapNestApiOptions,
): string[] {
  if (options.corsOrigins?.length) {
    return options.corsOrigins;
  }

  return [
    ...parseCorsOrigins(process.env.CORS_ORIGINS),
    ...parseCorsOrigins(process.env.CORS_ORIGIN),
  ];
}

export async function bootstrapNestApi(
  module: Type<unknown>,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const app = await NestFactory.create(module, { bufferLogs: true });

  app.use(helmet());
  app.useGlobalPipes(createProblemValidationPipe());

  if (options.enableCors ?? true) {
    const configuredOrigins = resolveConfiguredCorsOrigins(options);

    if (configuredOrigins.length > 0) {
      app.enableCors({
        origin: configuredOrigins,
        credentials: true,
      });
    } else if (process.env.NODE_ENV !== "production") {
      app.enableCors({
        origin: true,
        credentials: true,
      });
    }
  }

  const port = Number.parseInt(
    process.env.PORT ?? String(options.defaultPort),
    10,
  );
  await app.listen(port);
}
