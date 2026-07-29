import { describe, expect, it } from 'vitest';
import * as mongodbRuntime from './index';

describe('MongoDB runtime public API', () => {
  it('exports configuration, topology, transaction, module, and health surfaces', () => {
    expect(mongodbRuntime).toMatchObject({
      MongoClientToken: 'MONGODB_CLIENT',
      MongoDatabaseConfigService: expect.any(Function),
      MongoMainModule: expect.any(Function),
      MongoReadinessHealthIndicator: expect.any(Function),
      MongoTransactionReadinessHealthIndicator: expect.any(Function),
      MongoTransactionTopologyError: expect.any(Function),
      runInMongoTransaction: expect.any(Function),
    });
  });
});
