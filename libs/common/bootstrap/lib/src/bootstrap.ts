import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { createLogger } from "@app/common/logger";
import { initOpenTelemetry } from "@app/common/otel";
import { setupSwagger } from "@app/common/swagger";
import type { BootstrapParams } from "./type/bootstrap.type";
import { defaultPortFactory, getPortEnvVarName } from "./util/port.util";
import { robotsMiddleware } from "./util/robots.util";

export async function bootstrap(
  params: BootstrapParams,
): Promise<INestApplication> {
  initOpenTelemetry({ serviceName: params.name });
  const { logger, middlewares } = createLogger({ name: params.name });
  const module = await params.module;
  const app = await NestFactory.create(module, { logger, rawBody: true });
  const portEnvVarName = getPortEnvVarName(params.name);
  const portFromEnv = process.env[portEnvVarName];

  app.useLogger(logger);
  app.use(...middlewares);
  app.use(helmet());
  app.use(robotsMiddleware());

  const corsOptions =
    typeof params.cors === "function" ? await params.cors(app) : params.cors;
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  if (params.swagger) {
    setupSwagger(app, params.swagger);
  }

  if (params.gracefulShutdown ?? process.env.GRACEFUL_SHUTDOWN === "true") {
    app.enableShutdownHooks();
  }

  await params.hooks?.beforeListen?.(app);

  const port = await resolveBootstrapPort(params, app, portFromEnv);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port for ${params.name}: ${String(port)}`);
  }

  await app.listen(port);
  logger.log(`${params.name} listening on port ${port}`);
  await params.hooks?.afterListen?.(app);

  return app;
}

async function resolveBootstrapPort(
  params: BootstrapParams,
  app: INestApplication,
  portFromEnv: string | undefined,
): Promise<number> {
  if (portFromEnv !== undefined) {
    return Number.parseInt(portFromEnv, 10);
  }

  if (typeof params.port === "number") {
    return params.port;
  }

  return await (params.port ?? defaultPortFactory)(app);
}
