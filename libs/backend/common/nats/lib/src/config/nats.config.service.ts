import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import type { NatsConfig, NatsConnectionConfig } from "../type";
import { natsEnvSchema, type NatsEnvironment } from "./nats.env.schema";

@Injectable()
export class NatsConfigService {
  protected readonly configService =
    createConfig<NatsEnvironment>(natsEnvSchema);

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
