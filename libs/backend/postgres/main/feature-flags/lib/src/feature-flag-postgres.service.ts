import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type FeatureFlagContext,
  type FeatureFlagProvider,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
  toFeatureFlagBoolean,
} from '@app/common-feature-flags';
import { FeatureFlagRepository } from './infrastructure/data-access/repositories';

@Injectable()
export class PostgresFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = 'postgres';
  private readonly logger = new Logger(PostgresFeatureFlagProvider.name);

  constructor(
    @Inject(FeatureFlagRepository)
    private readonly featureFlags: FeatureFlagRepository,
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
    // Boolean gates accept boolean-like literals ('on'/'off', 1/0) so getValue
    // agrees with isEnabled for the same flag instead of treating a string such
    // as 'on' as a type mismatch against a boolean fallback.
    if (typeof fallback === 'boolean') {
      return toFeatureFlagBoolean(persisted) as T;
    }

    // FeatureFlagValue is boolean | string | number; guard the persisted value
    // against the fallback's type instead of blindly casting so a mistyped flag
    // (e.g. a string stored where a number is expected) cannot leak out.
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
