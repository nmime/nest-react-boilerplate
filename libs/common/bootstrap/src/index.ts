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

export async function bootstrapNestApi(
  module: Type<unknown>,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const app = await NestFactory.create(module, { bufferLogs: true });

  app.use(helmet());
  app.useGlobalPipes(createProblemValidationPipe());

  if (options.enableCors ?? true) {
    app.enableCors({
      origin: options.corsOrigins?.length ? options.corsOrigins : true,
      credentials: true,
    });
  }

  const port = Number.parseInt(
    process.env.PORT ?? String(options.defaultPort),
    10,
  );
  await app.listen(port);
}
