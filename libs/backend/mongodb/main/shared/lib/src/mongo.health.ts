import type { HealthIndicator, HealthIndicatorResult } from '@app/backend-common-health';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { MongoClient } from 'mongodb';
import {
  DefaultMongoHealthTimeoutMs,
  MongoClientToken,
  MongoHealthAdapter,
  MongoHealthOptionsToken,
} from './mongo.constants';
import { MongoDatabaseConfigService } from './mongo.config';
import {
  assertMongoTransactionTopology,
  MongoTransactionTopologyError,
  type MongoTransactionTopology,
} from './mongo.topology';
import { sharedMongoMigrations } from './migrations';
import { verifyAppliedMongoMigrations } from './migrations/mongo-migration';

export interface MongoHealthOptions {
  required?: boolean;
  timeoutMs?: number;
  readinessName?: string;
  transactionReadinessName?: string;
  migrationReadinessName?: string;
}

export interface MongoDependencyHealthAdapter {
  checkReadiness(): Promise<void>;
  checkMigrationReadiness(): Promise<void>;
  checkTransactionReadiness(): Promise<MongoTransactionTopology>;
}

@Injectable()
export class NativeMongoHealthAdapter implements MongoDependencyHealthAdapter {
  constructor(
    @Inject(MongoClientToken) private readonly client: MongoClient,
    private readonly config: MongoDatabaseConfigService,
  ) {}

  async checkReadiness(): Promise<void> {
    await this.client.db(this.config.database).command({ ping: 1 });
  }

  checkMigrationReadiness(): Promise<void> {
    return verifyAppliedMongoMigrations(this.client.db(this.config.database), sharedMongoMigrations);
  }

  checkTransactionReadiness(): Promise<MongoTransactionTopology> {
    return assertMongoTransactionTopology(this.client, this.config.replicaSet);
  }
}

@Injectable()
export class MongoMigrationReadinessHealthIndicator implements HealthIndicator {
  readonly name: string;
  readonly required: boolean;
  private readonly timeoutMs: number;

  constructor(
    @Inject(MongoHealthAdapter) private readonly adapter: MongoDependencyHealthAdapter,
    @Optional() @Inject(MongoHealthOptionsToken) options: MongoHealthOptions = {},
  ) {
    this.name = options.migrationReadinessName ?? 'mongodb-migrations';
    this.required = options.required ?? true;
    this.timeoutMs = healthTimeout(options.timeoutMs);
  }

  async check(): Promise<HealthIndicatorResult> {
    try {
      await withTimeout(this.adapter.checkMigrationReadiness(), this.timeoutMs, 'MongoDB migration check timed out.');
      return { name: this.name, status: 'ok', required: this.required, details: { applied: true } };
    } catch (error) {
      return healthFailure(this.name, this.required, 'MongoDB migration check failed.', error);
    }
  }
}

@Injectable()
export class MongoReadinessHealthIndicator implements HealthIndicator {
  readonly name: string;
  readonly required: boolean;
  private readonly timeoutMs: number;

  constructor(
    @Inject(MongoHealthAdapter) private readonly adapter: MongoDependencyHealthAdapter,
    @Optional() @Inject(MongoHealthOptionsToken) options: MongoHealthOptions = {},
  ) {
    this.name = options.readinessName ?? 'mongodb';
    this.required = options.required ?? true;
    this.timeoutMs = healthTimeout(options.timeoutMs);
  }

  async check(): Promise<HealthIndicatorResult> {
    try {
      await withTimeout(this.adapter.checkReadiness(), this.timeoutMs, 'MongoDB readiness check timed out.');
      return { name: this.name, status: 'ok', required: this.required, details: { reachable: true } };
    } catch (error) {
      return healthFailure(this.name, this.required, 'MongoDB readiness check failed.', error);
    }
  }
}

@Injectable()
export class MongoTransactionReadinessHealthIndicator implements HealthIndicator {
  readonly name: string;
  readonly required: boolean;
  private readonly timeoutMs: number;

  constructor(
    @Inject(MongoHealthAdapter) private readonly adapter: MongoDependencyHealthAdapter,
    @Optional() @Inject(MongoHealthOptionsToken) options: MongoHealthOptions = {},
  ) {
    this.name = options.transactionReadinessName ?? 'mongodb-transactions';
    this.required = options.required ?? true;
    this.timeoutMs = healthTimeout(options.timeoutMs);
  }

  async check(): Promise<HealthIndicatorResult> {
    try {
      const topology = await withTimeout(
        this.adapter.checkTransactionReadiness(),
        this.timeoutMs,
        'MongoDB transaction readiness check timed out.',
      );
      return {
        name: this.name,
        status: 'ok',
        required: this.required,
        details: { transactionCapable: true, topology: topology.kind },
      };
    } catch (error) {
      return healthFailure(this.name, this.required, 'MongoDB transaction readiness check failed.', error);
    }
  }
}

function healthTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DefaultMongoHealthTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('MongoDB health timeout must be a positive integer.');
  }
  return timeoutMs;
}

function healthFailure(name: string, required: boolean, message: string, error: unknown): HealthIndicatorResult {
  return {
    name,
    status: required ? 'error' : 'degraded',
    required,
    details: {
      message,
      ...(error instanceof MongoTransactionTopologyError ? { reason: error.code } : {}),
      ...(error instanceof Error ? { type: error.name } : {}),
    },
  };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}
