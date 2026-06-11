import { existsSync } from "node:fs";
import { join } from "node:path";
import { MikroORM } from "@mikro-orm/core";
import type {
  InjectionToken,
  OptionalFactoryDependency,
  Provider,
} from "@nestjs/common";
import {
  EnvHealthIndicator,
  HealthService,
  I18nAssetsHealthIndicator,
  RuntimeHealthIndicator,
  type HealthIndicator,
  type HealthIndicatorResult,
} from "@app/common/health";
import { supportedLocales } from "@app/common/i18n";
import { NatsHealthIndicator } from "@app/common/nats";
import { RedisHealthIndicator } from "@app/common/redis";
import {
  MikroOrmPostgresHealthAdapter,
  PostgresMigrationsHealthIndicator,
  PostgresReadinessHealthIndicator,
} from "@app/postgres-main";

const appName = "user-app-api";

export const UserAppHealthServiceProvider: Provider = {
  provide: HealthService,
  useFactory: (
    orm?: MikroORM,
    redisHealth?: RedisHealthIndicator,
    natsHealth?: NatsHealthIndicator,
  ) =>
    new HealthService({
      appName,
      indicators: createHealthIndicators({ orm, redisHealth, natsHealth }),
    }),
  inject: [
    optionalProvider(MikroORM),
    optionalProvider(RedisHealthIndicator),
    optionalProvider(NatsHealthIndicator),
  ],
};

interface HealthIndicatorDependencies {
  orm?: MikroORM;
  redisHealth?: RedisHealthIndicator;
  natsHealth?: NatsHealthIndicator;
}

function createHealthIndicators({
  orm,
  redisHealth,
  natsHealth,
}: HealthIndicatorDependencies): HealthIndicator[] {
  const postgresAdapter = new MikroOrmPostgresHealthAdapter(orm ?? null);

  return [
    new RuntimeHealthIndicator(),
    new EnvHealthIndicator({
      name: "config",
      required: false,
      optionalVariables: [
        "SESSION_SECRET",
        "AUTH_JWT_SECRET",
        "SESSION_COOKIE_NAME",
        "REDIS_URL",
        "NATS_SERVERS",
      ],
    }),
    new I18nAssetsHealthIndicator({
      rootPath: resolveI18nRootPath(),
      locales: supportedLocales,
      required: false,
    }),
    createSessionConfigHealthIndicator(),
    withRequired(
      new PostgresReadinessHealthIndicator(postgresAdapter, {
        mandatory: false,
      }),
      false,
    ),
    withRequired(
      new PostgresMigrationsHealthIndicator(postgresAdapter, {
        mandatory: false,
      }),
      false,
    ),
    redisHealth
      ? withRequired(redisHealth, false)
      : createSkippedOptionalDependencyIndicator("redis"),
    natsHealth
      ? withRequired(natsHealth, false)
      : createSkippedOptionalDependencyIndicator("nats"),
  ];
}

function withRequired(
  indicator: HealthIndicator,
  required: boolean,
): HealthIndicator {
  return {
    name: indicator.name,
    required,
    async check(context) {
      return { ...(await indicator.check(context)), required };
    },
  };
}

function resolveI18nRootPath(): string | undefined {
  const candidates = [
    join(process.cwd(), "i18n"),
    join(process.cwd(), "../../../i18n"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function createSkippedOptionalDependencyIndicator(
  name: "redis" | "nats",
): HealthIndicator {
  return {
    name,
    required: false,
    check(): HealthIndicatorResult {
      return {
        name,
        status: "ok",
        required: false,
        details: { enabled: false, skipped: true, reason: "not_configured" },
      };
    },
  };
}

function optionalProvider(token: InjectionToken): OptionalFactoryDependency {
  return { token, optional: true };
}

function createSessionConfigHealthIndicator(): HealthIndicator {
  return {
    name: "session-config",
    required: false,
    check(): HealthIndicatorResult {
      const hasSessionSecret = hasValue(process.env.SESSION_SECRET);
      const hasAuthSecret = hasValue(process.env.AUTH_JWT_SECRET);

      return {
        name: this.name,
        status: hasSessionSecret || hasAuthSecret ? "ok" : "degraded",
        required: false,
        details: {
          cookieNameConfigured: hasValue(process.env.SESSION_COOKIE_NAME),
          secretConfigured: hasSessionSecret || hasAuthSecret,
        },
      };
    },
  };
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
