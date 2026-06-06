import { Module } from "@nestjs/common";
import type {
  DynamicModule,
  OnApplicationShutdown,
  Provider,
} from "@nestjs/common";
import type { JetStreamClient, JetStreamManager } from "@nats-io/jetstream";
import type { Kvm } from "@nats-io/kv";
import type { NatsConnection } from "@nats-io/nats-core";
import type { Objm } from "@nats-io/obj";
import type { Svcm } from "@nats-io/services";
import { NatsConfigService } from "./config";
import {
  NatsInjectToken,
  NatsJetStreamInjectToken,
  NatsJetStreamManagerInjectToken,
  NatsKvManagerInjectToken,
  NatsObjectStoreManagerInjectToken,
  NatsServiceManagerInjectToken,
} from "./const";
import { InjectNatsConnection } from "./decorator";
import {
  closeNatsConnection,
  createNatsConnection,
} from "./nats-client.factory";
import {
  createNatsJetStream,
  createNatsJetStreamManager,
} from "./nats-jetstream.factory";
import { createNatsKvManager } from "./nats-kv.factory";
import { createNatsObjectStoreManager } from "./nats-object-store.factory";
import { createNatsServiceManager } from "./nats-services.factory";
import { NatsHealthIndicator } from "./nats.health";
import { NatsService } from "./nats.service";
import type { NatsConfig } from "./type";

export type NatsModuleOptions = NatsConfig;

class NatsShutdownService implements OnApplicationShutdown {
  constructor(
    @InjectNatsConnection()
    private readonly connection: NatsConnection | null,
    private readonly configService: NatsConfigService,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await closeNatsConnection(this.connection, {
      drainTimeoutMs: this.configService.drainTimeoutMs,
    });
  }
}

@Module({})
export class NatsModule {
  static forRoot(options: NatsModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: NatsConfigService,
        useValue: new NatsConfigService(options),
      },
      {
        provide: NatsInjectToken,
        useFactory: async (
          configService: NatsConfigService,
        ): Promise<NatsConnection | null> => {
          if (options.client !== undefined) {
            return options.client;
          }

          const config = configService.connectionConfig;
          if (!config) {
            return null;
          }

          return await (options.connectionFactory ?? createNatsConnection)(
            config,
          );
        },
        inject: [NatsConfigService],
      },
      {
        provide: NatsJetStreamInjectToken,
        useFactory: (
          connection: NatsConnection | null,
        ): JetStreamClient | null => {
          if (!connection) {
            return null;
          }

          return (options.jetStreamFactory ?? createNatsJetStream)(
            connection,
            options.jetStreamOptions,
          );
        },
        inject: [NatsInjectToken],
      },
      {
        provide: NatsJetStreamManagerInjectToken,
        useFactory: async (
          connection: NatsConnection | null,
        ): Promise<JetStreamManager | null> => {
          if (!connection) {
            return null;
          }

          return await (
            options.jetStreamManagerFactory ?? createNatsJetStreamManager
          )(connection, options.jetStreamOptions);
        },
        inject: [NatsInjectToken],
      },
      {
        provide: NatsKvManagerInjectToken,
        useFactory: (connection: NatsConnection | null): Kvm | null => {
          if (!connection) {
            return null;
          }

          return (options.kvManagerFactory ?? createNatsKvManager)(connection);
        },
        inject: [NatsInjectToken],
      },
      {
        provide: NatsObjectStoreManagerInjectToken,
        useFactory: (connection: NatsConnection | null): Objm | null => {
          if (!connection) {
            return null;
          }

          return (
            options.objectStoreManagerFactory ?? createNatsObjectStoreManager
          )(connection);
        },
        inject: [NatsInjectToken],
      },
      {
        provide: NatsServiceManagerInjectToken,
        useFactory: (connection: NatsConnection | null): Svcm | null => {
          if (!connection) {
            return null;
          }

          return (options.serviceManagerFactory ?? createNatsServiceManager)(
            connection,
          );
        },
        inject: [NatsInjectToken],
      },
      NatsShutdownService,
      NatsHealthIndicator,
      NatsService,
    ];

    return {
      module: NatsModule,
      providers,
      exports: providers,
    };
  }
}
