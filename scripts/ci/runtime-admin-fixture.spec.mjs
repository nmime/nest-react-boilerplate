// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { ownedFixtureConnection, seedOwnedRuntimeAdmin } from './runtime-admin-fixture.mjs';

const root = resolve(import.meta.dirname, '../..');
const config = {
  name: 'owned-fixture',
  services: {
    postgres: {
      environment: {
        POSTGRES_USER: 'fixture',
        POSTGRES_PASSWORD: 'owned-fixture-only',
        POSTGRES_DB: 'fixture_test',
      },
    },
    'auth-app-api': {},
    'admin-app-api': {},
  },
};
const container = {
  State: { Running: true },
  Config: {
    Labels: {
      'com.docker.compose.project': 'owned-fixture',
      'com.docker.compose.service': 'postgres',
      'com.docker.compose.project.config_files': resolve(root, 'docker/docker-compose.yml'),
    },
  },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } },
};

describe('runtime administrator fixture write authority', () => {
  it('derives its database from the observed owned loopback container', () => {
    const result = ownedFixtureConnection(config, container);
    const url = new URL(result.uri);
    assert.equal(result.provider, 'postgres');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '54321');
    assert.equal(result.database, 'fixture_test');
  });
  it('rejects foreign ownership, production compose files, stopped containers and public ports', () => {
    for (const changed of [
      { ...container, Config: { Labels: { ...container.Config.Labels, 'com.docker.compose.project': 'foreign' } } },
      {
        ...container,
        Config: {
          Labels: {
            ...container.Config.Labels,
            'com.docker.compose.project.config_files': resolve(root, 'docker/docker-compose.prod.yml'),
          },
        },
      },
      {
        ...container,
        Config: {
          Labels: {
            ...container.Config.Labels,
            'com.docker.compose.project.config_files': `${resolve(root, 'docker/docker-compose.yml')},${resolve(root, 'docker/docker-compose.prod.yml')}`,
          },
        },
      },
      { ...container, State: { Running: false } },
      { ...container, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '54321' }] } } },
    ])
      assert.throws(() => ownedFixtureConnection(config, changed));
  });
  it('refuses ambiguous database selection and production before any inspection or write', async () => {
    assert.throws(() =>
      ownedFixtureConnection({ ...config, services: { ...config.services, mongodb: {} } }, container),
    );
    await assert.rejects(seedOwnedRuntimeAdmin({ NODE_ENV: 'production' }), /cannot run in production/u);
  });
});
