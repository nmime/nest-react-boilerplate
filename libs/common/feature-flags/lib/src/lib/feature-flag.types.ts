export type FeatureFlagValue = boolean | string | number;

export interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
  roles?: readonly string[];
  attributes?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface FeatureFlagSnapshot {
  values: Readonly<Record<string, FeatureFlagValue>>;
  source: string;
}

export interface FeatureFlagProvider {
  readonly name: string;
  isEnabled(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<boolean> | boolean;
  getValue<T extends FeatureFlagValue>(
    key: string,
    fallback: T,
    context?: FeatureFlagContext,
  ): Promise<T> | T;
  getSnapshot?(
    context?: FeatureFlagContext,
  ): Promise<FeatureFlagSnapshot> | FeatureFlagSnapshot;
}

export const FeatureFlagProviderToken = "app.feature-flags.provider";

export const DefaultFeatureFlagTenantId =
  "00000000-0000-0000-0000-000000000000";
