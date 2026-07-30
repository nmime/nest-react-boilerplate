import type { FeatureFlagValue } from '@app/common-feature-flags';

export interface MongoFeatureFlag {
  createdAt: Date;
  description: string;
  enabled: boolean;
  id: string;
  key: string;
  tenantId: string;
  updatedAt: Date;
  value: FeatureFlagValue;
}

export interface MongoFeatureFlagRepositoryError {
  code: 'repository_error';
  message: string;
}

export interface MongoFeatureFlagUpsertInput {
  description?: string | null;
  enabled?: boolean;
  key: string;
  tenantId?: string;
  value: FeatureFlagValue;
}

export interface FeatureFlagDocument {
  _id: string;
  createdAt: Date;
  description: string;
  enabled: boolean;
  key: string;
  tenantId: string;
  updatedAt: Date;
  value: FeatureFlagValue;
}
