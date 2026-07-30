import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import * as authzSource from '@app/common-authz';
import type { AcceptanceWorld } from '../support/world.ts';

// Executable acceptance evidence for REQ-AUTH-ACCESS-001.
const authz = (authzSource as unknown as { default?: typeof authzSource }).default ?? authzSource;
const { normalizeStringList, permissionsForRoles } = authz;
Given('a malformed role claim', function (this: AcceptanceWorld) {
  this.claim = 'admin';
});

Given('an unknown normalized role', function (this: AcceptanceWorld) {
  this.claim = ['unregistered-administrator'];
});

When('authorization normalizes the claim', function (this: AcceptanceWorld) {
  this.normalizedRoles = normalizeStringList(this.claim);
  this.permissions = permissionsForRoles(this.normalizedRoles);
});

When('permissions are resolved', function (this: AcceptanceWorld) {
  this.normalizedRoles = normalizeStringList(this.claim);
  this.permissions = permissionsForRoles(this.normalizedRoles);
});

Then('no role or permission is granted', function (this: AcceptanceWorld) {
  assert.deepEqual(this.permissions, []);
  if (typeof this.claim === 'string') {
    assert.deepEqual(this.normalizedRoles, []);
  }
});
