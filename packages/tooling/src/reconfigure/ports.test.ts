// @requirements REQ-SCAFFOLD-INIT-004 REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultRuntimeConfig, defaultRuntimePorts, parseNrbConfig } from '../setup/schema.js';
import { portOrder, renderPortsDocument } from './ports.js';
describe('port registry', () => {
  it('covers all 24 ports and renders the staging/container matrix', async () => {
    const config = parseNrbConfig({
      schemaVersion: '2.0.0',
      apps: [],
      capabilities: [],
      runtime: { ...defaultRuntimeConfig, ports: defaultRuntimePorts },
    });
    assert.equal(portOrder.length, 24);
    const rendered = await renderPortsDocument(config);
    assert.match(rendered, /`admin-app-api`\s+\|\s+3001/u);
    assert.match(rendered, /`admin-app-api`\s+\|\s+3101\s+\|\s+3001/u);
    assert.match(rendered, /containers listen on `80`/u);
  });
});
