import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";
import type { NatsConfig, NatsConnectionConfig } from "../type";

interface NatsEnvironment {
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

const schema = Joi.object<NatsEnvironment>({
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

@Injectable()
export class NatsConfigService {
  protected readonly configService = createConfig(schema);

  constructor(private readonly options: NatsConfig = {}) {}

  get servers(): string[] {
    return this.options.servers ?? this.configService.get("NATS_SERVERS");
  }

  get name(): string | undefined {
    return this.options.name ?? this.configService.get("NATS_NAME");
  }

  get user(): string | undefined {
    return this.options.user ?? this.configService.get("NATS_USER");
  }

  get pass(): string | undefined {
    return this.options.pass ?? this.configService.get("NATS_PASS");
  }

  get token(): string | undefined {
    return this.options.token ?? this.configService.get("NATS_TOKEN");
  }

  get timeoutMs(): number | undefined {
    return this.options.timeoutMs ?? this.configService.get("NATS_TIMEOUT_MS");
  }

  get reconnect(): boolean | undefined {
    return this.options.reconnect ?? this.configService.get("NATS_RECONNECT");
  }

  get maxReconnectAttempts(): number | undefined {
    return (
      this.options.maxReconnectAttempts ??
      this.configService.get("NATS_MAX_RECONNECT_ATTEMPTS")
    );
  }

  get reconnectTimeWaitMs(): number | undefined {
    return (
      this.options.reconnectTimeWaitMs ??
      this.configService.get("NATS_RECONNECT_TIME_WAIT_MS")
    );
  }

  get waitOnFirstConnect(): boolean | undefined {
    return (
      this.options.waitOnFirstConnect ??
      this.configService.get("NATS_WAIT_ON_FIRST_CONNECT")
    );
  }

  get pingIntervalMs(): number | undefined {
    return (
      this.options.pingIntervalMs ??
      this.configService.get("NATS_PING_INTERVAL_MS")
    );
  }

  get drainTimeoutMs(): number {
    return (
      this.options.drainTimeoutMs ??
      this.configService.get("NATS_DRAIN_TIMEOUT_MS")
    );
  }

  get connectionConfig(): NatsConnectionConfig | undefined {
    if (this.servers.length === 0) {
      return undefined;
    }

    this.validateAuthentication();

    return {
      servers: this.servers,
      name: this.name,
      user: this.user,
      pass: this.pass,
      token: this.token,
      timeoutMs: this.timeoutMs,
      reconnect: this.reconnect,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectTimeWaitMs: this.reconnectTimeWaitMs,
      waitOnFirstConnect: this.waitOnFirstConnect,
      pingIntervalMs: this.pingIntervalMs,
    };
  }

  private validateAuthentication(): void {
    if (this.token && (this.user || this.pass)) {
      throw new Error(
        "NATS_TOKEN is mutually exclusive with NATS_USER/NATS_PASS.",
      );
    }

    if ((this.user && !this.pass) || (!this.user && this.pass)) {
      throw new Error("NATS_USER and NATS_PASS must be configured together.");
    }
  }
}

function parseServersConfig(value: string): string[] {
  if (value === "") {
    return [];
  }

  return value
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);
}
