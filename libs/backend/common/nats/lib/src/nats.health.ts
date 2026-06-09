import { Injectable } from "@nestjs/common";
import type { NatsConnection } from "@nats-io/nats-core";
import { InjectNatsConnection } from "./decorator";

@Injectable()
export class NatsHealthIndicator {
  readonly name = "nats";

  constructor(
    @InjectNatsConnection()
    private readonly connection: NatsConnection | null,
  ) {}

  async check(): Promise<{
    name: string;
    status: "ok" | "error";
    details?: Record<string, unknown>;
  }> {
    if (!this.connection) {
      return {
        name: this.name,
        status: "ok",
        details: { enabled: false },
      };
    }

    if (this.connection.isClosed()) {
      return this.error("connection is closed");
    }

    if (this.connection.isDraining()) {
      return this.error("connection is draining");
    }

    try {
      await this.connection.flush();
      return {
        name: this.name,
        status: "ok",
        details: {
          enabled: true,
          server: this.connection.getServer(),
        },
      };
    } catch (error) {
      return this.error(error instanceof Error ? error.message : String(error));
    }
  }

  private error(message: string): {
    name: string;
    status: "error";
    details: Record<string, unknown>;
  } {
    return {
      name: this.name,
      status: "error",
      details: { message },
    };
  }
}
