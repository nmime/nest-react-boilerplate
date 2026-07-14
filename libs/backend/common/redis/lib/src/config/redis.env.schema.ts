// Lib-private Redis environment schema. Intentionally NOT re-exported from
// config/index.ts: it backs RedisConfigService's env parsing and must stay out
// of the public @app/backend-common-redis API.
import Joi from 'joi';
import { RedisMode } from '../const';
import type { RedisHost } from '../type';
import { parseHostsConfig } from './util';

export interface RedisEnvironment {
  REDIS_MODE: RedisMode;
  REDIS_URL?: string;
  REDIS_HOSTS: RedisHost[];
  REDIS_PASSWORD?: string;
  REDIS_DB?: number;
  REDIS_SENTINEL_GROUP_IDENTIFIER?: string;
  REDIS_KEY_PREFIX?: string;
  REDIS_LAZY_CONNECT: boolean;
}

const redisHostSchema = Joi.object<RedisHost>({
  host: Joi.string().required(),
  port: Joi.number().integer().port().required(),
});

export const redisEnvSchema = Joi.object<RedisEnvironment>({
  REDIS_MODE: Joi.string()
    .valid(RedisMode.Single, RedisMode.Sentinel, RedisMode.Cluster)
    .empty('')
    .default(RedisMode.Single),
  REDIS_URL: Joi.string().empty('').optional(),
  REDIS_HOSTS: Joi.alternatives()
    .try(Joi.array().items(redisHostSchema), Joi.string().custom(parseHostsConfig, 'Redis hosts list'))
    .default([]),
  REDIS_PASSWORD: Joi.string().empty('').optional(),
  REDIS_DB: Joi.number().integer().optional(),
  REDIS_SENTINEL_GROUP_IDENTIFIER: Joi.string().empty('').optional(),
  REDIS_KEY_PREFIX: Joi.string().empty('').optional(),
  REDIS_LAZY_CONNECT: Joi.boolean().truthy('1', 'true', 'yes', 'on').falsy('0', 'false', 'no', 'off').default(true),
});
