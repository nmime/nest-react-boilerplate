// @requirements REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { parseNrbConfig } from '../../setup/schema.js';
import { reconfigureGenerator } from './generator.js';

describe('@repo/tooling:reconfigure generator', () => {
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
});
