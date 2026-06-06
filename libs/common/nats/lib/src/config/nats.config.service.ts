import { Injectable } from "@nestjs/common";
import type { NatsConfig, NatsConnectionConfig } from "../type";

@Injectable()
export class NatsConfigService {
  constructor(private readonly options: NatsConfig = {}) {}

  get servers(): string[] {
    return this.options.servers ?? parseServers(process.env.NATS_SERVERS);
  }

  get name(): string | undefined {
    return emptyToUndefined(this.options.name ?? process.env.NATS_NAME);
  }

  get user(): string | undefined {
    return emptyToUndefined(this.options.user ?? process.env.NATS_USER);
  }

  get pass(): string | undefined {
    return emptyToUndefined(this.options.pass ?? process.env.NATS_PASS);
  }

  get token(): string | undefined {
    return emptyToUndefined(this.options.token ?? process.env.NATS_TOKEN);
  }

  get timeoutMs(): number | undefined {
    return (
      this.options.timeoutMs ??
      parseOptionalPositiveInteger(process.env.NATS_TIMEOUT_MS)
    );
  }

  get reconnect(): boolean | undefined {
    return (
      this.options.reconnect ?? parseOptionalBoolean(process.env.NATS_RECONNECT)
    );
  }

  get maxReconnectAttempts(): number | undefined {
    return (
      this.options.maxReconnectAttempts ??
      parseOptionalInteger(process.env.NATS_MAX_RECONNECT_ATTEMPTS)
    );
  }

  get reconnectTimeWaitMs(): number | undefined {
    return (
      this.options.reconnectTimeWaitMs ??
      parseOptionalPositiveInteger(process.env.NATS_RECONNECT_TIME_WAIT_MS)
    );
  }

  get waitOnFirstConnect(): boolean | undefined {
    return (
      this.options.waitOnFirstConnect ??
      parseOptionalBoolean(process.env.NATS_WAIT_ON_FIRST_CONNECT)
    );
  }

  get pingIntervalMs(): number | undefined {
    return (
      this.options.pingIntervalMs ??
      parseOptionalPositiveInteger(process.env.NATS_PING_INTERVAL_MS)
    );
  }

  get drainTimeoutMs(): number {
    return (
      this.options.drainTimeoutMs ??
      parseOptionalPositiveInteger(process.env.NATS_DRAIN_TIMEOUT_MS) ??
      5000
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

function parseServers(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (!/^-?\d+$/u.test(value)) {
    throw new Error(`Invalid NATS integer value: ${value}`);
  }

  return Number.parseInt(value, 10);
}

function parseOptionalPositiveInteger(
  value: string | undefined,
): number | undefined {
  const parsed = parseOptionalInteger(value);
  if (parsed !== undefined && parsed <= 0) {
    throw new Error(`Invalid positive NATS integer value: ${value}`);
  }

  return parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`Invalid NATS boolean value: ${value}`);
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
