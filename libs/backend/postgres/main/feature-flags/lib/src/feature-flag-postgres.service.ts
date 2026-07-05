import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type FeatureFlagContext,
  type FeatureFlagProvider,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
  toFeatureFlagBoolean,
} from "@app/common-feature-flags";
import { FeatureFlagRepository } from "./infrastructure/data-access/repositories";

@Injectable()
export class PostgresFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = "postgres";
  private readonly logger = new Logger(PostgresFeatureFlagProvider.name);

  constructor(
    @Inject(FeatureFlagRepository)
    private readonly featureFlags: FeatureFlagRepository,
  ) {}

  async isEnabled(
    key: string,
    context: FeatureFlagContext = {},
  ): Promise<boolean> {
    const result = await this.featureFlags.findByKey(key, context.tenantId);

    return (
      result.isOk() &&
      result.value?.enabled === true &&
      toFeatureFlagBoolean(result.value.value)
    );
  }

  async getValue<T extends FeatureFlagValue>(
    key: string,
    fallback: T,
    context: FeatureFlagContext = {},
  ): Promise<T> {
    const result = await this.featureFlags.findByKey(key, context.tenantId);
    if (!result.isOk() || result.value?.enabled !== true) {
      return fallback;
    }

    const persisted = result.value.value;
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

  async getSnapshot(
    context: FeatureFlagContext = {},
  ): Promise<FeatureFlagSnapshot> {
    const result = await this.featureFlags.getSnapshot(context);

    return result.isOk() ? result.value : { source: this.name, values: {} };
  }
}
