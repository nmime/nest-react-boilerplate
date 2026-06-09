import { Injectable } from "@nestjs/common";
import type { Lister } from "@nats-io/jetstream";
import type {
  ObjectStore,
  ObjectStoreOptions,
  ObjectStoreStatus,
} from "@nats-io/obj";
import {
  createObjm,
  type NatsObjectStoreSource,
} from "./nats-object-store.factory";
import { NatsService } from "./nats.service";

export type NatsObjectStoreOpenOptions = boolean | { check?: boolean };

@Injectable()
export class NatsObjectStoreService {
  constructor(private readonly natsService: NatsService) {}

  get isEnabled(): boolean {
    return this.natsService.isEnabled;
  }

  getManager(source?: NatsObjectStoreSource): ReturnType<typeof createObjm> {
    return createObjm(source ?? this.natsService.getConnection());
  }

  async createStore(
    name: string,
    options: Partial<ObjectStoreOptions> = {},
  ): Promise<ObjectStore> {
    return await this.getManager().create(name, options);
  }

  async openStore(
    name: string,
    options?: NatsObjectStoreOpenOptions,
  ): Promise<ObjectStore> {
    return await this.getManager().open(name, options);
  }

  listStores(): Lister<ObjectStoreStatus> {
    return this.getManager().list() as Lister<ObjectStoreStatus>;
  }
}
