import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNrbConfig, schemaVersion } from './schema.js';
import { materializeSelection, updateSelection } from './selection.js';

describe('repeatable setup selection', () => {
  it('uses a preset as an exact shortcut on first run', () => {
    const config = updateSelection(null, { preset: 'web', options: { nonInteractive: true } });
    assert.equal(config.preset, 'web');
    assert.deepEqual(config.apps, []);
    assert.ok(materializeSelection(config).apps.includes('landing-app'));
    assert.ok(!materializeSelection(config).apps.includes('mobile-app'));
  });

  it('uses a preset as an exact replacement on a later run', () => {
    const existing = updateSelection(null, { addApps: ['landing-app'] });
    const config = updateSelection(existing, { preset: 'minimal' });
    assert.equal(config.preset, 'minimal');
    assert.ok(!materializeSelection(config).apps.includes('landing-app'));
  });

  it('adds an app to the materialized existing selection', () => {
    const existing = parseNrbConfig({ schemaVersion, apps: ['landing-app'] });
    const config = updateSelection(existing, { addApps: ['user-app'] });
    assert.equal(config.preset, undefined);
    assert.deepEqual(config.apps, ['auth-app-api', 'landing-app', 'user-app', 'user-app-api']);
    assert.deepEqual(config.capabilities, ['i18n', 'postgres']);
  });

  it('can be rerun with the same addition without changing the selection', () => {
    const existing = updateSelection(null, { addApps: ['user-app'] });
    const rerun = updateSelection(existing, { addApps: ['user-app'] });
    assert.deepEqual(rerun.apps, existing.apps);
    assert.deepEqual(rerun.capabilities, existing.capabilities);
  });

  it('removes an optional app while preserving the rest', () => {
    const existing = updateSelection(null, { addApps: ['landing-app', 'site-app'] });
    const config = updateSelection(existing, { removeApps: ['landing-app'] });
    assert.deepEqual(config.apps, ['site-app']);
  });

  it('refuses to remove an application that remains required', () => {
    const existing = updateSelection(null, { addApps: ['user-app'] });
    assert.throws(
      () => updateSelection(existing, { removeApps: ['auth-app-api'] }),
      /Cannot remove application "auth-app-api".*required by user-app/,
    );
  });

  it('refuses to remove the only database provider', () => {
    const existing = updateSelection(null, { addApps: ['user-app'] });
    assert.throws(
      () => updateSelection(existing, { removeCapabilities: ['postgres'] }),
      /require exactly one durable database provider/,
    );
  });

  it('swaps database providers atomically', () => {
    const existing = updateSelection(null, {
      addApps: ['user-app-api'],
      addCapabilities: ['postgres'],
    });
    const config = updateSelection(existing, {
      addCapabilities: ['mongodb'],
      removeCapabilities: ['postgres'],
    });

    assert.deepEqual(config.capabilities, ['mongodb']);
  });

  it('supports an explicit replacement selection', () => {
    const existing = updateSelection(null, { preset: 'fullstack' });
    const config = updateSelection(existing, { replace: true, addApps: ['landing-app'] });
    assert.deepEqual(config.apps, ['landing-app']);
    assert.deepEqual(config.capabilities, []);
  });
});
