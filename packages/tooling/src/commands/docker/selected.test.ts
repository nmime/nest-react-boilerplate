// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateGeneratedSelectionEnvironment,
  validateSelectedComposeServices,
  validateSelectedDatabaseEnvironment,
} from './selected.ts';
import { parseSelectedClosure } from '../../setup/closure.ts';
import type { ConfiguredSelection } from '../../setup/closure-workspace.ts';
import { defaultOperationalFields } from '../../setup/test-fixtures.ts';

const mongoEnvironment = {
  NRB_CAPABILITIES: 'mongodb',
  COMPOSE_PROFILES: 'mongodb,user-app-api',
  DATABASE_ENGINE: 'mongodb',
  AUTH_PERSISTENCE: 'mongodb',
  MONGODB_URI: 'mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true',
  MONGODB_DATABASE: 'nest_react_boilerplate',
  MONGODB_REPLICA_SET: 'rs0',
};

const postgresEnvironment = {
  NRB_CAPABILITIES: 'postgres',
  COMPOSE_PROFILES: 'postgres,user-app-api',
  DATABASE_ENGINE: 'postgres',
  AUTH_PERSISTENCE: 'postgres',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/nest_react_boilerplate',
  CONTAINER_DATABASE_URL: 'postgres://postgres:postgres@postgres:5432/nest_react_boilerplate',
};

describe('docker selected database validation', () => {
  it('accepts one internally consistent provider', () => {
    assert.equal(validateSelectedDatabaseEnvironment('mongodb', mongoEnvironment), 'mongodb');
    assert.equal(validateSelectedDatabaseEnvironment('postgres', postgresEnvironment), 'postgres');
  });

  it('accepts a consistent provider-free state and rejects conflicting provider states', () => {
    assert.equal(
      validateSelectedDatabaseEnvironment(null, {
        NRB_CAPABILITIES: '',
        COMPOSE_PROFILES: 'landing-app',
        DATABASE_ENGINE: '',
        AUTH_PERSISTENCE: '',
      }),
      undefined,
    );
    assert.throws(
      () => validateSelectedDatabaseEnvironment('postgres', { ...postgresEnvironment, NRB_CAPABILITIES: 'mongodb,postgres' }),
      /exactly one database provider/u,
    );
    assert.throws(
      () => validateSelectedDatabaseEnvironment('postgres', { ...postgresEnvironment, NRB_CAPABILITIES: '' }),
      /fresh closure selects postgres/u,
    );
  });

  it('rejects mismatched selectors, profiles, and unsafe MongoDB configuration', () => {
    assert.throws(
      () => validateSelectedDatabaseEnvironment('mongodb', { ...mongoEnvironment, AUTH_PERSISTENCE: 'postgres' }),
      /must both match/u,
    );
    assert.throws(
      () => validateSelectedDatabaseEnvironment('mongodb', { ...mongoEnvironment, COMPOSE_PROFILES: 'mongodb,postgres' }),
      /only the selected mongodb/u,
    );
    assert.throws(
      () => validateSelectedDatabaseEnvironment('mongodb', { ...mongoEnvironment, MONGODB_URI: 'mongodb://user:secret@mongodb.localhost/db' }),
      /credential-free local replica set/u,
    );
  });

  it('requires only the selected provider one-shots in the resolved graph', () => {
    assert.doesNotThrow(() =>
      validateSelectedComposeServices(
        'mongodb',
        ['mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app-api'],
        ['mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app-api'],
      ),
    );
    assert.doesNotThrow(() =>
      validateSelectedComposeServices('postgres', ['postgres', 'migrate', 'user-app-api'], ['postgres', 'migrate', 'user-app-api']),
    );
    assert.doesNotThrow(() => validateSelectedComposeServices(undefined, ['landing-app'], ['landing-app']));
    assert.throws(
      () => validateSelectedComposeServices(undefined, ['landing-app'], ['landing-app', 'postgres']),
      /provider-free.*unexpected: postgres/u,
    );
    assert.throws(
      () =>
        validateSelectedComposeServices(
          'mongodb',
          ['mongodb', 'mongodb-init', 'mongodb-migrate'],
          ['mongodb', 'mongodb-init', 'postgres', 'migrate'],
        ),
      /missing: mongodb-migrate.*unexpected: postgres, migrate/u,
    );
  });

  it('rejects stale generated app, capability, profile, and service leakage', () => {
    const selected = parseSelectedClosure({
      schemaVersion: 1,
      configHash: 'a'.repeat(64),
      graphDigest: 'b'.repeat(64),
      provider: null,
      roots: ['landing-app'],
      projects: ['landing-app'],
      targets: { build: ['landing-app'] },
      productExternalPackages: {},
      toolingExternalPackages: {},
      services: ['landing-app'],
      releaseImages: ['landing-app'],
    });
    const selection: ConfiguredSelection = {
      apps: ['landing-app'],
      capabilities: [],
      configHash: 'a'.repeat(64),
      ...defaultOperationalFields(),
    };
    assert.doesNotThrow(() =>
      validateGeneratedSelectionEnvironment(selected, selection, {
        NRB_APPS: 'landing-app',
        NRB_CAPABILITIES: '',
        COMPOSE_PROFILES: 'landing-app',
      }),
    );
    assert.throws(
      () =>
        validateGeneratedSelectionEnvironment(selected, selection, {
          NRB_APPS: 'landing-app,user-app',
          NRB_CAPABILITIES: '',
          COMPOSE_PROFILES: 'landing-app,user-app',
        }),
      /NRB_APPS is stale/u,
    );
  });
});
