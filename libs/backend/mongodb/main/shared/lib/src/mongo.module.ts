import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import {
  assertDurableDatabaseEnvironment,
  DurableDatabaseRuntimeInjectToken,
  type BackendSessionStoreOptions,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { MongoClientToken, MongoDatabaseToken, MongoHealthAdapter, MongoHealthOptionsToken } from './mongo.constants';
import {
  createMongoClientOptions,
  MongoDatabaseConfigService,
  resolveExpectedReplicaSet,
  type MongoEnvironmentInput,
} from './mongo.config';
import {
  MongoReadinessHealthIndicator,
  MongoMigrationReadinessHealthIndicator,
  MongoTransactionReadinessHealthIndicator,
  NativeMongoHealthAdapter,
  type MongoHealthOptions,
} from './mongo.health';
import { assertMongoTransactionTopology } from './mongo.topology';
import { sharedMongoMigrations } from './migrations';
import { verifyAppliedMongoMigrations } from './migrations/mongo-migration';
import { MongoSessionStore } from './mongo-session.store';

export type MongoClientFactory = (uri: string, options: MongoClientOptions) => MongoClient;

export const nativeMongoClientFactory: MongoClientFactory = (uri, options) => new MongoClient(uri, options);

export interface MongoModuleOptions {
  env?: MongoEnvironmentInput;
  clientOptions?: Readonly<MongoClientOptions>;
  clientFactory?: MongoClientFactory;
  health?: MongoHealthOptions;
}

export class MongoClientLifecycle implements OnApplicationShutdown {
  private closed = false;

  constructor(private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.client.close();
  }
}

@Injectable()
export class MongoSharedMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, sharedMongoMigrations);
  }
}

@Injectable()
class MongoDurableDatabaseRuntime implements DurableDatabaseRuntime, OnModuleInit {
  readonly provider = 'mongodb' as const;

  constructor(
    readiness: MongoReadinessHealthIndicator,
    transactionReadiness: MongoTransactionReadinessHealthIndicator,
    migrationReadiness: MongoMigrationReadinessHealthIndicator,
  ) {
    this.healthIndicators = [readiness, transactionReadiness, migrationReadiness];
  }

  readonly healthIndicators: DurableDatabaseRuntime['healthIndicators'];

  onModuleInit(): void {
    assertDurableDatabaseEnvironment(this.provider);
  }

  createSessionStore(options: BackendSessionStoreOptions): MongoSessionStore {
    return new MongoSessionStore(options.env, options.defaultMaxAgeSeconds);
  }
}

export async function connectTransactionReadyMongoClient(
  config: MongoDatabaseConfigService,
  clientOptions: Readonly<MongoClientOptions> = {},
  clientFactory: MongoClientFactory = nativeMongoClientFactory,
): Promise<MongoClient> {
  const options = createMongoClientOptions(config, clientOptions);
  const expectedReplicaSet = resolveExpectedReplicaSet(config.uri, config.replicaSet, options.replicaSet);
  const client = clientFactory(config.uri, options);
  try {
    await client.connect();
    await assertMongoTransactionTopology(client, expectedReplicaSet);
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

@Global()
@Module({})
export class MongoMainModule {
  static forRoot(options: MongoModuleOptions = {}): DynamicModule {
    const config = new MongoDatabaseConfigService(options.env);
    const providers: Provider[] = [
      { provide: MongoDatabaseConfigService, useValue: config },
      {
        provide: MongoClientToken,
        useFactory: () => connectTransactionReadyMongoClient(config, options.clientOptions, options.clientFactory),
      },
      {
        provide: MongoDatabaseToken,
        useFactory: (client: MongoClient): Db => client.db(config.database),
        inject: [MongoClientToken],
      },
      { provide: MongoHealthOptionsToken, useValue: options.health ?? {} },
      NativeMongoHealthAdapter,
      { provide: MongoHealthAdapter, useExisting: NativeMongoHealthAdapter },
      MongoReadinessHealthIndicator,
      MongoMigrationReadinessHealthIndicator,
      MongoTransactionReadinessHealthIndicator,
      MongoSharedMigrationVerifier,
      MongoDurableDatabaseRuntime,
      { provide: DurableDatabaseRuntimeInjectToken, useExisting: MongoDurableDatabaseRuntime },
      {
        provide: MongoClientLifecycle,
        useFactory: (client: MongoClient) => new MongoClientLifecycle(client),
        inject: [MongoClientToken],
      },
    ];

    return {
      module: MongoMainModule,
      providers,
      exports: [
        MongoDatabaseConfigService,
        MongoClientToken,
        MongoDatabaseToken,
        MongoHealthAdapter,
        MongoReadinessHealthIndicator,
        MongoMigrationReadinessHealthIndicator,
        MongoTransactionReadinessHealthIndicator,
        DurableDatabaseRuntimeInjectToken,
      ],
    };
  }
}
