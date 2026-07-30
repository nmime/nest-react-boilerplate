import { Injectable } from '@nestjs/common';
import { createConfig } from '@app/common-config';
import Joi from 'joi';
import type { MongoClientOptions } from 'mongodb';
import ConnectionString from 'mongodb-connection-string-url';
import {
  DefaultMongoConnectTimeoutMs,
  DefaultMongoMaxPoolSize,
  DefaultMongoMinPoolSize,
  DefaultMongoServerSelectionTimeoutMs,
} from './mongo.constants';

export interface MongoEnvironment {
  MONGODB_URI: string;
  MONGODB_DATABASE: string;
  MONGODB_REPLICA_SET?: string;
  MONGODB_APP_NAME?: string;
  MONGODB_CONNECT_TIMEOUT_MS: number;
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: number;
  MONGODB_MIN_POOL_SIZE: number;
  MONGODB_MAX_POOL_SIZE: number;
}

export type MongoEnvironmentInput = Readonly<Record<string, unknown>>;

const mongoEnvironmentSchema = Joi.object<MongoEnvironment>({
  MONGODB_URI: Joi.string().trim().required(),
  MONGODB_DATABASE: Joi.string().trim().min(1).required(),
  MONGODB_REPLICA_SET: Joi.string().trim().min(1).empty('').optional(),
  MONGODB_APP_NAME: Joi.string().trim().min(1).empty('').optional(),
  MONGODB_CONNECT_TIMEOUT_MS: Joi.number().integer().positive().empty('').default(DefaultMongoConnectTimeoutMs),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .empty('')
    .default(DefaultMongoServerSelectionTimeoutMs),
  MONGODB_MIN_POOL_SIZE: Joi.number().integer().min(0).empty('').default(DefaultMongoMinPoolSize),
  MONGODB_MAX_POOL_SIZE: Joi.number().integer().positive().empty('').default(DefaultMongoMaxPoolSize),
});

@Injectable()
export class MongoDatabaseConfigService {
  private readonly environment: Readonly<MongoEnvironment>;

  constructor(env: MongoEnvironmentInput = process.env) {
    this.environment = createMongoEnvironment(env);
  }

  get uri(): string {
    return this.environment.MONGODB_URI;
  }

  get database(): string {
    return this.environment.MONGODB_DATABASE;
  }

  get replicaSet(): string | undefined {
    return this.environment.MONGODB_REPLICA_SET;
  }

  get appName(): string | undefined {
    return this.environment.MONGODB_APP_NAME;
  }

  get connectTimeoutMs(): number {
    return this.environment.MONGODB_CONNECT_TIMEOUT_MS;
  }

  get serverSelectionTimeoutMs(): number {
    return this.environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS;
  }

  get minPoolSize(): number {
    return this.environment.MONGODB_MIN_POOL_SIZE;
  }

  get maxPoolSize(): number {
    return this.environment.MONGODB_MAX_POOL_SIZE;
  }

  get values(): Readonly<MongoEnvironment> {
    return this.environment;
  }
}

export function createMongoEnvironment(env: MongoEnvironmentInput = process.env): Readonly<MongoEnvironment> {
  validateMongoUriInput(env.MONGODB_URI);
  const values = createConfig<MongoEnvironment>(mongoEnvironmentSchema, { env }).values;
  if (values.MONGODB_MIN_POOL_SIZE > values.MONGODB_MAX_POOL_SIZE) {
    throw new Error('Invalid environment configuration: MONGODB_MIN_POOL_SIZE must not exceed MONGODB_MAX_POOL_SIZE.');
  }

  assertSafeMongoUriOptions(values.MONGODB_URI);
  return values;
}

export function createMongoClientOptions(
  config: MongoDatabaseConfigService,
  overrides: Readonly<MongoClientOptions> = {},
): MongoClientOptions {
  assertSafeMongoClientOptions(config.uri, config.replicaSet, overrides);
  const replicaSet = resolveExpectedReplicaSet(config.uri, config.replicaSet, overrides.replicaSet);

  return {
    appName: config.appName,
    connectTimeoutMS: config.connectTimeoutMs,
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
    minPoolSize: config.minPoolSize,
    maxPoolSize: config.maxPoolSize,
    retryReads: true,
    ...overrides,
    retryWrites: true,
    directConnection: false,
    loadBalanced: false,
    writeConcern: { w: 'majority' },
    ...(replicaSet === undefined ? {} : { replicaSet }),
  };
}

export function resolveExpectedReplicaSet(
  uri: string,
  configuredReplicaSet?: string,
  optionReplicaSet?: string,
): string | undefined {
  const candidates = [mongoUriOption(uri, 'replicaset'), configuredReplicaSet, optionReplicaSet].filter(
    (value): value is string => value !== undefined,
  );
  const expected = candidates[0];
  if (expected !== undefined && candidates.some((value) => value !== expected)) {
    throw new Error('MongoDB replica-set configuration must use one consistent replica-set name.');
  }

  return expected;
}

function validateMongoUriInput(value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '') {
    return;
  }

  try {
    const parsed = new ConnectionString(value);
    if (parsed.hosts.some((host) => host.trim() === '')) {
      throw new Error('Unsupported MongoDB URI.');
    }
  } catch {
    throw new Error('Invalid environment configuration: MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI.');
  }
}

function assertSafeMongoUriOptions(uri: string): void {
  assertNotEnabled(mongoUriOption(uri, 'directconnection'), 'directConnection');
  assertNotEnabled(mongoUriOption(uri, 'loadbalanced'), 'loadBalanced');
  assertNotDisabled(mongoUriOption(uri, 'retrywrites'), 'retryWrites');
  assertMajorityWriteConcern(mongoUriOption(uri, 'w'));
  assertNotDisabled(mongoUriOption(uri, 'journal'), 'journal');
  assertNotDisabled(mongoUriOption(uri, 'j'), 'journal');
  const replicaSet = mongoUriOption(uri, 'replicaset');
  if (replicaSet !== undefined && replicaSet.trim() === '') {
    throw new Error('MongoDB replicaSet URI option must not be empty.');
  }
}

function assertSafeMongoClientOptions(
  uri: string,
  configuredReplicaSet: string | undefined,
  options: Readonly<MongoClientOptions>,
): void {
  assertSafeMongoUriOptions(uri);
  if (options.directConnection === true) {
    throw new Error('MongoDB directConnection is not allowed for the transaction-capable runtime.');
  }
  if (options.loadBalanced === true) {
    throw new Error('MongoDB loadBalanced mode is not allowed because startup must verify deployment topology.');
  }
  if (options.retryWrites === false) {
    throw new Error('MongoDB retryWrites cannot be disabled for the transaction-capable runtime.');
  }
  const writeConcern = options.writeConcern as
    { readonly w?: string | number; readonly journal?: boolean; readonly j?: boolean } | undefined;
  assertMajorityWriteConcern(writeConcern?.w);
  if (writeConcern?.journal === false || writeConcern?.j === false) {
    throw new Error('MongoDB journal cannot be disabled for the majority-durable runtime.');
  }
  resolveExpectedReplicaSet(uri, configuredReplicaSet, options.replicaSet);
}

function assertMajorityWriteConcern(value: string | number | undefined): void {
  if (value !== undefined && String(value).toLowerCase() !== 'majority') {
    throw new Error('MongoDB write concern cannot be weaker than majority.');
  }
}

function mongoUriOption(uri: string, optionName: string): string | undefined {
  const values = [...new ConnectionString(uri).searchParams.entries()]
    .filter(([name]) => name.toLowerCase() === optionName)
    .map(([, value]) => value);
  if (values.length > 1 && values.some((value) => value !== values[0])) {
    throw new Error(`MongoDB URI option ${optionName} must not have conflicting values.`);
  }

  return values[0];
}

function assertNotEnabled(value: string | undefined, optionName: string): void {
  if (value?.toLowerCase() === 'true') {
    throw new Error(`MongoDB ${optionName} is not allowed for the transaction-capable runtime.`);
  }
}

function assertNotDisabled(value: string | undefined, optionName: string): void {
  if (value?.toLowerCase() === 'false') {
    throw new Error(`MongoDB ${optionName} cannot be disabled for the transaction-capable runtime.`);
  }
}
