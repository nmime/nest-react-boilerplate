import { Injectable } from "@nestjs/common";
import type { Msg, PublishOptions, RequestOptions } from "@nats-io/nats-core";
import type { NatsConnection } from "@nats-io/nats-core";
import { InjectNatsConnection } from "./decorator";

export class NatsConnectionUnavailableError extends Error {
  constructor(reason: string) {
    super(`NATS connection is unavailable: ${reason}.`);
    this.name = "NatsConnectionUnavailableError";
  }
}

@Injectable()
export class NatsService {
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
    this.publishString(subject, JSON.stringify(payload), options);
  }

  publishString(
    subject: string,
    payload: string,
    options?: PublishOptions,
  ): void {
    this.activeConnection().publish(subject, payload, options);
  }

  async requestJson<TResponse, TPayload = unknown>(
    subject: string,
    payload?: TPayload,
    options?: RequestOptions,
  ): Promise<TResponse> {
    const response = await this.requestMessage(
      subject,
      payload === undefined ? undefined : JSON.stringify(payload),
      options,
    );

    return response.json<TResponse>();
  }

  async requestString(
    subject: string,
    payload?: string,
    options?: RequestOptions,
  ): Promise<string> {
    const response = await this.requestMessage(subject, payload, options);

    return response.string();
  }

  private async requestMessage(
    subject: string,
    payload?: string,
    options?: RequestOptions,
  ): Promise<Msg> {
    return await this.activeConnection().request(subject, payload, options);
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
