import { Injectable } from "@nestjs/common";
import {
  JSONCodec,
  type NatsConnection,
  type PublishOptions,
  type RequestOptions,
} from "nats";
import { InjectNatsConnection } from "./decorator";

export class NatsConnectionUnavailableError extends Error {
  constructor(reason: string) {
    super(`NATS connection is unavailable: ${reason}.`);
    this.name = "NatsConnectionUnavailableError";
  }
}

@Injectable()
export class NatsService {
  private readonly jsonCodec = JSONCodec<unknown>();

  constructor(
    @InjectNatsConnection()
    private readonly connection: NatsConnection | null,
  ) {}

  get isEnabled(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }

  getConnection(): NatsConnection {
    return this.activeConnection();
  }

  publishJson<TPayload>(
    subject: string,
    payload: TPayload,
    options?: PublishOptions,
  ): void {
    this.activeConnection().publish(
      subject,
      this.jsonCodec.encode(payload),
      options,
    );
  }

  async requestJson<TResponse, TPayload = unknown>(
    subject: string,
    payload: TPayload,
    options?: RequestOptions,
  ): Promise<TResponse> {
    const response = await this.activeConnection().request(
      subject,
      this.jsonCodec.encode(payload),
      options,
    );

    return this.jsonCodec.decode(response.data) as TResponse;
  }

  private activeConnection(): NatsConnection {
    if (!this.connection) {
      throw new NatsConnectionUnavailableError("not configured");
    }

    if (this.connection.isClosed()) {
      throw new NatsConnectionUnavailableError("closed");
    }

    if (this.connection.isDraining()) {
      throw new NatsConnectionUnavailableError("draining");
    }

    return this.connection;
  }
}
