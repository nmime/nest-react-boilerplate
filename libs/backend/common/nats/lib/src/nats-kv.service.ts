import { Injectable } from "@nestjs/common";
import type { KV, KvOptions } from "@nats-io/kv";
import { createKvm, type NatsKvSource } from "./nats-kv.factory";
import { NatsService } from "./nats.service";

@Injectable()
export class NatsKvService {
  constructor(private readonly natsService: NatsService) {}

  get isEnabled(): boolean {
    return this.natsService.isEnabled;
  }

  getManager(source?: NatsKvSource) {
    return createKvm(source ?? this.natsService.getConnection());
  }

  async createBucket(
    name: string,
    options: Partial<KvOptions> = {},
  ): Promise<KV> {
    return await this.getManager().create(name, options);
  }

  async openBucket(
    name: string,
    options: Partial<KvOptions> = {},
  ): Promise<KV> {
    return await this.getManager().open(name, options);
  }
}
