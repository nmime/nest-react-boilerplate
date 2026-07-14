import Joi from 'joi';
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresPoolIdleTimeoutMs,
  DefaultPostgresPoolMax,
  DefaultPostgresPoolMin,
  DefaultPostgresPort,
  DefaultPostgresUser,
} from './const';
import type { PostgresEnvironment } from './type';

export const booleanSchema = Joi.boolean().truthy('1', 'true', 'yes', 'on').falsy('0', 'false', 'no', 'off');

export const schema = Joi.object<PostgresEnvironment>({
  DATABASE_URL: Joi.string().empty('').optional(),
  POSTGRES_HOST: Joi.string().empty('').default(DefaultPostgresHost),
  POSTGRES_PORT: Joi.number().integer().port().empty('').default(DefaultPostgresPort),
  POSTGRES_USER: Joi.string().empty('').default(DefaultPostgresUser),
  POSTGRES_PASSWORD: Joi.string().empty('').default('postgres'),
  POSTGRES_DB: Joi.string().empty('').default(DefaultPostgresDatabase),
  POSTGRES_SSL: booleanSchema.empty('').default(false),
  POSTGRES_SSL_REJECT_UNAUTHORIZED: booleanSchema.empty('').default(true),
  POSTGRES_SYNCHRONIZE: booleanSchema.empty('').optional(),
  POSTGRES_LOGGING: booleanSchema.empty('').default(false),
  POSTGRES_POOL_MIN: Joi.number().integer().min(0).empty('').default(DefaultPostgresPoolMin),
  POSTGRES_POOL_MAX: Joi.number().integer().min(1).empty('').default(DefaultPostgresPoolMax),
  POSTGRES_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(0).empty('').default(DefaultPostgresPoolIdleTimeoutMs),
  POSTGRES_SLOW_QUERY_MS: Joi.number().integer().min(0).empty('').optional(),
});
