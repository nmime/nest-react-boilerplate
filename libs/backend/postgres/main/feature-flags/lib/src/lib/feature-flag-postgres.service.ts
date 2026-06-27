import { Injectable } from "@nestjs/common";
import {
  type FeatureFlagContext,
  type FeatureFlagProvider,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
  toFeatureFlagBoolean,
} from "@app/common/feature-flags";
import { FeatureFlagRepository } from "./infrastructure/data-access/repositories";

@Injectable()
export class PostgresFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = "postgres";

  constructor(private readonly featureFlags: FeatureFlagRepository) {}

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

    return result.isOk() && result.value?.enabled === true
      ? (result.value.value as T)
      : fallback;
  }

  async getSnapshot(
    context: FeatureFlagContext = {},
  ): Promise<FeatureFlagSnapshot> {
    const result = await this.featureFlags.getSnapshot(context);

    return result.isOk() ? result.value : { source: this.name, values: {} };
  }
}
