import { Injectable } from "@nestjs/common";
import type { NatsConnection } from "@nats-io/nats-core";
import type { HealthIndicatorResult } from "@app/backend/common/health";
import { InjectNatsConnection } from "./decorator";

@Injectable()
export class NatsHealthIndicator {
  readonly name = "nats";

  constructor(
    @InjectNatsConnection()
    private readonly connection: NatsConnection | null,
  ) {}

  async check(): Promise<HealthIndicatorResult> {
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
          server: redactDependencyDetail(this.connection.getServer()),
        },
      };
    } catch (error) {
      return this.error(error instanceof Error ? error.message : String(error));
    }
  }

  private error(message: string): HealthIndicatorResult {
    return {
      name: this.name,
      status: "error",
      details: { message: redactDependencyDetail(message) },
    };
  }
}

const connectionCredentialPattern = new RegExp(
  ["([a-z][a-z0-9+.-]*://)", "([^\\s/@:]+)", ":", "([^\\s/@]+)", "@"].join(""),
  "giu",
);
const secretAssignmentPattern =
  /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^\s,;]+)/giu;

function redactDependencyDetail(value: string): string {
  return value
    .replace(connectionCredentialPattern, "$1[redacted]@")
    .replace(secretAssignmentPattern, "$1=[redacted]");
}
