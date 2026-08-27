// @requirements REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { parseNrbConfig } from '../../setup/schema.js';
import { reconfigureGenerator } from './generator.js';

describe('@repo/tooling:reconfigure generator', () => {
  it('uses plan mode for the shared rewrite-only dry run', async () => {
    const tree = createTreeWithEmptyWorkspace();
    const desired = parseNrbConfig({
      schemaVersion: '2.0.0',
      apps: [],
      capabilities: [],
      identity: { slug: 'acme-platform', packageName: 'acme-platform' },
    });
    tree.write('nrb.config.json', `${JSON.stringify(desired, null, 2)}\n`);
    tree.write('README.md', 'nest-react-boilerplate\n');

    await reconfigureGenerator(tree, { plan: true });

    assert.equal(tree.read('README.md', 'utf8'), 'nest-react-boilerplate\n');
    assert.equal(tree.exists('.nrb/identity.json'), false);
    assert.equal(tree.exists('.nrb/state.json'), false);
  });

  it('uses the shared engine and writes the same manifest/state contract', async () => {
    const tree = createTreeWithEmptyWorkspace();
    const desired = parseNrbConfig({
      schemaVersion: '2.0.0',
      apps: [],
      capabilities: [],
      identity: { slug: 'acme-app', packageName: 'acme-app', domain: 'acme.example' },
      deployment: { publicDomain: 'acme.example' },
      options: {},
    });
    tree.write('nrb.config.json', `${JSON.stringify(desired, null, 2)}\n`);
    tree.write('README.md', 'nest-react-boilerplate example.com\n');

    await reconfigureGenerator(tree, { force: true });

    assert.equal(tree.read('README.md', 'utf8'), 'acme-app acme.example\n');
    assert.ok(tree.exists('.nrb/identity.json'));
    assert.ok(tree.exists('.nrb/state.json'));
  });

  it('does not let virtual-tree tenant changes bypass the durable seed marker', async () => {
    const tree = createTreeWithEmptyWorkspace();
    const desired = parseNrbConfig({
      schemaVersion: '2.0.0',
      apps: [],
      capabilities: [],
      tenant: { defaultTenantId: '11111111-1111-1111-1111-111111111111' },
    });
    tree.write('nrb.config.json', `${JSON.stringify(desired, null, 2)}\n`);
    tree.write('.nrb/seed-state.json', '{"seeded":true}\n');

    await assert.rejects(reconfigureGenerator(tree, {}), /seed-state\.json records seeded state/u);
  });
});
