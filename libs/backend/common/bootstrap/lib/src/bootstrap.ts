import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { createLogger } from '@app/backend-common-logger';
import { initOpenTelemetry, shutdownOpenTelemetry } from '@app/backend-common-otel';
import { setupSwagger } from '@app/backend-common-swagger';
import type { BootstrapParams } from './type/bootstrap.type';
import { getPortEnvVarName } from './util/port.util';
import { robotsMiddleware } from './util/robots.util';
import { withOpenTelemetryLifecycle } from './open-telemetry-lifecycle';

export async function bootstrap(params: BootstrapParams): Promise<INestApplication> {
  initOpenTelemetry({
    serviceName: params.name,
    serviceVersion: process.env.OTEL_SERVICE_VERSION ?? process.env.npm_package_version,
    environment: process.env.NODE_ENV,
  });
  try {
    return await createAndStartApplication(params);
  } catch (error) {
    await shutdownOpenTelemetry();
    throw error;
  }
}

async function createAndStartApplication(params: BootstrapParams): Promise<INestApplication> {
  const { logger, middlewares } = createLogger({ name: params.name });
  const module = await params.module;
  const app = await NestFactory.create(withOpenTelemetryLifecycle(module), { logger, rawBody: true });
  const portEnvVarName = getPortEnvVarName(params.name);
  const portFromEnv = process.env[portEnvVarName];

  app.useLogger(logger);
  app.use(...middlewares);
  app.use(helmet());
  app.use(robotsMiddleware());

  const corsOptions = typeof params.cors === 'function' ? await params.cors(app) : params.cors;
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  if (params.swagger) {
    setupSwagger(app, params.swagger);
  }

  if (params.gracefulShutdown ?? process.env.GRACEFUL_SHUTDOWN === 'true') {
    app.enableShutdownHooks();
  }

  await params.hooks?.beforeListen?.(app);

  const port = resolveBootstrapPort(params, portFromEnv ?? process.env.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port for ${params.name}: ${String(port)}`);
  }

  await app.listen(port);
  logger.log(`${params.name} listening on port ${port}`);
  await params.hooks?.afterListen?.(app);

  return app;
}

function resolveBootstrapPort(params: BootstrapParams, portFromEnv: string | undefined): number {
  if (portFromEnv !== undefined && portFromEnv.trim() !== '') {
    const trimmed = portFromEnv.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid port for ${params.name}: ${portFromEnv}`);
    }
    return Number(trimmed);
  }

  if (typeof params.port === 'number') {
    return params.port;
  }

  throw new Error(
    `No explicit port configured for "${params.name}". ` +
      `Set ${getPortEnvVarName(params.name)} or PORT environment variable, or pass port in options.`,
  );
}
