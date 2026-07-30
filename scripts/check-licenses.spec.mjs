// @requirements REQ-ASSURANCE-RELEASE-003
import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgedUnlicensed, allowedLicenses, collectLicenseViolations } from './check-licenses.mjs';

test('an allow-listed inventory produces no violations', () => {
  assert.deepEqual(
    collectLicenseViolations({
      MIT: [{ name: 'react' }],
      'Apache-2.0': [{ name: 'typescript' }],
      ISC: [{ name: 'semver' }],
    }),
    [],
  );
});

test('a copyleft licence outside the allow-list fails the gate', () => {
  const violations = collectLicenseViolations({ 'AGPL-3.0-only': [{ name: 'some-agpl-package' }] });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /AGPL-3\.0-only: not allow-listed \(some-agpl-package\)/u);
});

test('a newly unlicensed package fails while acknowledged ones pass', () => {
  const violations = collectLicenseViolations({
    Unknown: [{ name: '@tamagui/native' }, { name: 'brand-new-mystery-package' }],
  });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /brand-new-mystery-package: declares no licence/u);
});

test('the allow-list refuses viral copyleft families outright', () => {
  for (const license of ['GPL-3.0-only', 'AGPL-3.0-or-later', 'GPL-2.0-only', 'SSPL-1.0']) {
    assert.equal(allowedLicenses.has(license), false, `${license} must not be allow-listed`);
  }
});

test('every acknowledged unlicensed package is a concrete package name', () => {
  assert.ok(acknowledgedUnlicensed.size > 0);
  for (const name of acknowledgedUnlicensed) {
    assert.match(name, /^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9.-]*$/u);
  }
});
