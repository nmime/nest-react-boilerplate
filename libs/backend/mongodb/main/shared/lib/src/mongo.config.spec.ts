import { describe, expect, it } from 'vitest';
import {
  createMongoClientOptions,
  createMongoEnvironment,
  MongoDatabaseConfigService,
  resolveExpectedReplicaSet,
} from './mongo.config';
import {
  DefaultMongoConnectTimeoutMs,
  DefaultMongoMaxPoolSize,
  DefaultMongoMinPoolSize,
  DefaultMongoServerSelectionTimeoutMs,
} from './mongo.constants';

const baseEnv = {
  MONGODB_URI: 'mongodb://mongo-a:27017,mongo-b:27018/app?replicaSet=rs0',
  MONGODB_DATABASE: 'app',
};

describe('MongoDB configuration', () => {
  it('parses required settings and bounded connection defaults', () => {
    expect(createMongoEnvironment(baseEnv)).toEqual({
      ...baseEnv,
      MONGODB_CONNECT_TIMEOUT_MS: DefaultMongoConnectTimeoutMs,
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: DefaultMongoServerSelectionTimeoutMs,
      MONGODB_MIN_POOL_SIZE: DefaultMongoMinPoolSize,
      MONGODB_MAX_POOL_SIZE: DefaultMongoMaxPoolSize,
    });
  });

  it('coerces environment values and exposes every setting through the config service', () => {
    const service = new MongoDatabaseConfigService({
      MONGODB_URI: 'mongodb+srv://cluster.example/app',
      MONGODB_DATABASE: 'records',
      MONGODB_REPLICA_SET: 'atlas-rs',
      MONGODB_APP_NAME: 'worker',
      MONGODB_CONNECT_TIMEOUT_MS: '1200',
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2300',
      MONGODB_MIN_POOL_SIZE: '2',
      MONGODB_MAX_POOL_SIZE: '12',
    });

    expect(service.uri).toBe('mongodb+srv://cluster.example/app');
    expect(service.database).toBe('records');
    expect(service.replicaSet).toBe('atlas-rs');
    expect(service.appName).toBe('worker');
    expect(service.connectTimeoutMs).toBe(1200);
    expect(service.serverSelectionTimeoutMs).toBe(2300);
    expect(service.minPoolSize).toBe(2);
    expect(service.maxPoolSize).toBe(12);
    expect(service.values).toMatchObject({ MONGODB_DATABASE: 'records', MONGODB_MAX_POOL_SIZE: 12 });
  });

  it('requires a valid MongoDB URI and explicit database without leaking credentials', () => {
    expect(() => createMongoEnvironment({ MONGODB_DATABASE: 'app' })).toThrow(/MONGODB_URI/u);
    expect(() =>
      createMongoEnvironment({ MONGODB_URI: 'http://user:secret@example.test', MONGODB_DATABASE: 'app' }),
    ).toThrow('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI.');
    expect(() => createMongoEnvironment({ MONGODB_URI: 'mongodb://user:secret@', MONGODB_DATABASE: 'app' })).toThrow(
      'MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI.',
    );
    expect(() => createMongoEnvironment({ MONGODB_URI: baseEnv.MONGODB_URI })).toThrow(/MONGODB_DATABASE/u);

    try {
      createMongoEnvironment({ MONGODB_URI: 'mongodb://user:secret@', MONGODB_DATABASE: 'app' });
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });

  it('rejects invalid pool and timeout values', () => {
    expect(() => createMongoEnvironment({ ...baseEnv, MONGODB_MAX_POOL_SIZE: 0 })).toThrow(/MONGODB_MAX_POOL_SIZE/u);
    expect(() => createMongoEnvironment({ ...baseEnv, MONGODB_CONNECT_TIMEOUT_MS: 'soon' })).toThrow(
      /MONGODB_CONNECT_TIMEOUT_MS/u,
    );
    expect(() => createMongoEnvironment({ ...baseEnv, MONGODB_MIN_POOL_SIZE: 5, MONGODB_MAX_POOL_SIZE: 4 })).toThrow(
      'MONGODB_MIN_POOL_SIZE must not exceed MONGODB_MAX_POOL_SIZE.',
    );
  });

  it.each([
    ['mongodb://mongo/app?directConnection=true', 'directConnection'],
    ['mongodb://mongo/app?loadBalanced=true', 'loadBalanced'],
    ['mongodb://mongo/app?retryWrites=false', 'retryWrites'],
    ['mongodb://mongo/app?w=1', 'majority'],
    ['mongodb://mongo/app?w=majority&journal=false', 'journal'],
    ['mongodb://mongo/app?replicaSet=', 'replicaSet'],
    ['mongodb://mongo/app?replicaSet=rs0&REPLICASET=rs1', 'conflicting'],
  ])('rejects unsafe URI %s', (uri, expected) => {
    expect(() => createMongoEnvironment({ MONGODB_URI: uri, MONGODB_DATABASE: 'app' })).toThrow(expected);
  });

  it('builds safe driver options and never allows overrides to weaken invariants', () => {
    const config = new MongoDatabaseConfigService({
      ...baseEnv,
      MONGODB_APP_NAME: 'api',
      MONGODB_MIN_POOL_SIZE: 1,
      MONGODB_MAX_POOL_SIZE: 9,
    });
    expect(createMongoClientOptions(config, { maxPoolSize: 7, retryWrites: true })).toEqual(
      expect.objectContaining({
        appName: 'api',
        replicaSet: 'rs0',
        minPoolSize: 1,
        maxPoolSize: 7,
        retryReads: true,
        retryWrites: true,
        directConnection: false,
        loadBalanced: false,
        writeConcern: { w: 'majority' },
      }),
    );

    expect(() => createMongoClientOptions(config, { directConnection: true })).toThrow('directConnection');
    expect(() => createMongoClientOptions(config, { loadBalanced: true })).toThrow('loadBalanced');
    expect(() => createMongoClientOptions(config, { retryWrites: false })).toThrow('retryWrites');
    expect(() => createMongoClientOptions(config, { writeConcern: { w: 1 } })).toThrow('majority');
    expect(() => createMongoClientOptions(config, { writeConcern: { w: 'majority', journal: false } })).toThrow(
      'journal',
    );
  });

  it('does not invent a replica-set name for a topology discovered at startup', () => {
    const config = new MongoDatabaseConfigService({
      MONGODB_URI: 'mongodb+srv://cluster.example/app',
      MONGODB_DATABASE: 'app',
    });
    expect(createMongoClientOptions(config)).not.toHaveProperty('replicaSet');
  });

  it('resolves one expected replica set and rejects mismatches', () => {
    expect(resolveExpectedReplicaSet('mongodb://mongo/app')).toBeUndefined();
    expect(resolveExpectedReplicaSet('mongodb://mongo/app?replicaSet=rs0', 'rs0', 'rs0')).toBe('rs0');
    expect(() => resolveExpectedReplicaSet('mongodb://mongo/app?replicaSet=rs0', 'rs1')).toThrow(
      'one consistent replica-set name',
    );
  });
});
