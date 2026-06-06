import { Module } from "@nestjs/common";
import type {
  DynamicModule,
  OnApplicationShutdown,
  Provider,
} from "@nestjs/common";
import type { NatsConnection } from "nats";
import { NatsConfigService } from "./config";
import { NatsInjectToken } from "./const";
import { InjectNatsConnection } from "./decorator";
import {
  closeNatsConnection,
  createNatsConnection,
} from "./nats-client.factory";
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
