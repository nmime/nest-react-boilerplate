import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type FeatureFlagContext,
  type FeatureFlagProvider,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
  toFeatureFlagBoolean,
} from '@app/common-feature-flags';
import { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';

@Injectable()
export class MongoFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = 'mongodb';
  private readonly logger = new Logger(MongoFeatureFlagProvider.name);

  constructor(
    @Inject(MongoFeatureFlagRepository)
    private readonly featureFlags: MongoFeatureFlagRepository,
  ) {}

  async isEnabled(key: string, context: FeatureFlagContext = {}): Promise<boolean> {
    const result = await this.featureFlags.findByKey(key, context.tenantId);
    if (result.isErr()) {
      this.logger.error(`Failed to evaluate feature flag "${key}": ${result.error.message}`);
      return false;
    }
    return result.value?.enabled === true && toFeatureFlagBoolean(result.value.value);
  }

  async getValue<T extends FeatureFlagValue>(key: string, fallback: T, context: FeatureFlagContext = {}): Promise<T> {
    const result = await this.featureFlags.findByKey(key, context.tenantId);
    if (result.isErr()) {
      this.logger.error(`Failed to evaluate feature flag "${key}": ${result.error.message}`);
      return fallback;
    }
    if (result.value?.enabled !== true) {
      return fallback;
    }

    const persisted = result.value.value;
    if (typeof fallback === 'boolean') {
      return toFeatureFlagBoolean(persisted) as T;
    }
    if (typeof persisted !== typeof fallback) {
      this.logger.warn(
        `Feature flag "${key}" is a ${typeof persisted} but the fallback is a ${typeof fallback}; using fallback.`,
      );
      return fallback;
    }
    return persisted as T;
  }

  async getSnapshot(context: FeatureFlagContext = {}): Promise<FeatureFlagSnapshot> {
    const result = await this.featureFlags.getSnapshot(context);
    if (result.isErr()) {
      this.logger.error(`Failed to load feature flag snapshot: ${result.error.message}`);
      return { source: this.name, values: {} };
    }
    return result.value;
  }
}
