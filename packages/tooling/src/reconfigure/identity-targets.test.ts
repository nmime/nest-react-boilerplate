// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyIdentityReplacements, buildIdentityReplacements, defaultIdentity } from './identity-targets.js';

describe('reconfigure — identity-targets', () => {
  it('produces no replacements when identity is unchanged', () => {
    const identity = defaultIdentity();
    assert.deepEqual(buildIdentityReplacements(identity, identity), []);
  });

  it('replaces slug and derived slug-api', () => {
    const prev = defaultIdentity();
    const next = { ...prev, slug: 'acme-platform', packageName: 'acme-platform', brand: { ...prev.brand } };
    const replacements = buildIdentityReplacements(prev, next);
    assert.ok(replacements.some((r) => r.from === 'nest-react-boilerplate' && r.to === 'acme-platform'));
    assert.ok(replacements.some((r) => r.from === 'nest-react-boilerplate-api' && r.to === 'acme-platform-api'));
  });

  it('replaces dbName in connection strings', () => {
    const prev = defaultIdentity();
    const next = { ...prev, dbName: 'acme_platform', brand: { ...prev.brand } };
    const replacements = buildIdentityReplacements(prev, next);
    const content = 'postgres://postgres:postgres@localhost:5432/nest_react_boilerplate';
    const result = applyIdentityReplacements(content, replacements);
    assert.equal(result, 'postgres://postgres:postgres@localhost:5432/acme_platform');
  });

  it('replaces domain and brand values', () => {
    const prev = defaultIdentity();
    const next = {
      ...prev,
      domain: 'acme.example',
      owner: 'acme-inc',
      brand: { ...prev.brand, s3Bucket: 'acme-platform', helmChart: 'acme-platform' },
    };
    const replacements = buildIdentityReplacements(prev, next);
    assert.ok(replacements.some((r) => r.label === 'domain'));
    assert.ok(replacements.some((r) => r.label === 'owner'));
    assert.ok(replacements.some((r) => r.label === 's3Bucket'));
  });

  it('applyIdentityReplacements is deterministic and handles multiple occurrences', () => {
    const replacements = [
      { from: 'nest-react-boilerplate', to: 'acme', label: 'slug' },
      { from: 'example.com', to: 'acme.example', label: 'domain' },
    ];
    const content = 'nest-react-boilerplate at example.com and nest-react-boilerplate again';
    const result = applyIdentityReplacements(content, replacements);
    assert.equal(result, 'acme at acme.example and acme again');
  });

  it('replaces className', () => {
    const prev = defaultIdentity();
    const next = { ...prev, className: 'AcmePlatform', brand: { ...prev.brand } };
    const replacements = buildIdentityReplacements(prev, next);
    assert.ok(replacements.some((r) => r.from === 'NestReactBoilerplate' && r.to === 'AcmePlatform'));
  });
});
