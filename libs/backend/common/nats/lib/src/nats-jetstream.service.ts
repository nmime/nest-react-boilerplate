import { Injectable } from "@nestjs/common";
import type {
  JetStreamClient,
  JetStreamManager,
  JetStreamManagerOptions,
  JetStreamOptions,
  JetStreamPublishOptions,
  PubAck,
} from "@nats-io/jetstream";
import type { Payload } from "@nats-io/nats-core";
import {
  createJetStream,
  createJetStreamManager,
} from "./nats-jetstream.factory";
import { NatsService } from "./nats.service";

@Injectable()
export class NatsJetStreamService {
  constructor(private readonly natsService: NatsService) {}

  get isEnabled(): boolean {
    return this.natsService.isEnabled;
  }

  getClient(options?: JetStreamOptions): JetStreamClient {
    return createJetStream(this.natsService.getConnection(), options);
  }

  async getManager(
    options?: JetStreamManagerOptions,
  ): Promise<JetStreamManager> {
    return await createJetStreamManager(
      this.natsService.getConnection(),
      options,
    );
  }

  async publish(
    subject: string,
    payload?: Payload,
    options?: JetStreamPublishOptions,
  ): Promise<PubAck> {
    return await this.getClient().publish(subject, payload, options);
  }

  async publishJson<TPayload>(
    subject: string,
    payload: TPayload,
    options?: JetStreamPublishOptions,
  ): Promise<PubAck> {
    return await this.publish(subject, JSON.stringify(payload), options);
  }
}
