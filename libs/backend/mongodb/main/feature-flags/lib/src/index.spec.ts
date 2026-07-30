// @requirements REQ-RUNTIME-DATABASE-008
import { describe, expect, it } from 'vitest';
import * as featureFlagsMongo from './index';

describe('MongoDB feature flag public API', () => {
  it('exports collection initialization, repository, provider, and module surfaces', () => {
    expect(featureFlagsMongo).toMatchObject({
      FeatureFlagCollectionName: 'feature_flags',
      FeatureFlagMongoMigrationVerifier: expect.any(Function),
      FeatureFlagsMongoModule: expect.any(Function),
      MongoFeatureFlagProvider: expect.any(Function),
      MongoFeatureFlagRepository: expect.any(Function),
      initializeFeatureFlagCollection: expect.any(Function),
    });
  });
});
