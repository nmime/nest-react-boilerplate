import Joi from "joi";
import { parseServersConfig } from "./util";

export interface NatsEnvironment {
  NATS_SERVERS: string[];
  NATS_NAME?: string;
  NATS_USER?: string;
  NATS_PASS?: string;
  NATS_TOKEN?: string;
  NATS_TIMEOUT_MS?: number;
  NATS_RECONNECT?: boolean;
  NATS_MAX_RECONNECT_ATTEMPTS?: number;
  NATS_RECONNECT_TIME_WAIT_MS?: number;
  NATS_WAIT_ON_FIRST_CONNECT?: boolean;
  NATS_PING_INTERVAL_MS?: number;
  NATS_DRAIN_TIMEOUT_MS: number;
}

const optionalString = Joi.string().empty("").optional();
const optionalBoolean = Joi.boolean()
  .truthy("1", "true", "yes", "on")
  .falsy("0", "false", "no", "off")
  .optional();
const optionalInteger = Joi.number().integer().optional();
const optionalPositiveInteger = Joi.number().integer().positive().optional();

export const natsEnvSchema = Joi.object<NatsEnvironment>({
  NATS_SERVERS: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().required()),
      Joi.string().custom(parseServersConfig, "NATS server list"),
    )
    .default([]),
  NATS_NAME: optionalString,
  NATS_USER: optionalString,
  NATS_PASS: optionalString,
  NATS_TOKEN: optionalString,
  NATS_TIMEOUT_MS: optionalPositiveInteger,
  NATS_RECONNECT: optionalBoolean,
  NATS_MAX_RECONNECT_ATTEMPTS: optionalInteger,
  NATS_RECONNECT_TIME_WAIT_MS: optionalPositiveInteger,
  NATS_WAIT_ON_FIRST_CONNECT: optionalBoolean,
  NATS_PING_INTERVAL_MS: optionalPositiveInteger,
  NATS_DRAIN_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .empty("")
    .default(5000),
});
