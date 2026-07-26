// @requirements REQ-SCAFFOLD-GENERATORS-003
/**
 * Tests for the shared name utilities used by all generators.
 *
 * UNIT: isolated function tests for each name converter.
 * COMPONENT: multi-unit integration (generateNames + validateName).
 * E2E: full name pipeline from raw input to all derived forms.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cloneStyleBaseName,
  findAdjacentOwner,
  toKebab,
  toCamel,
  toPascal,
  toTitle,
  toConstant,
  generateNames,
  validateName,
} from './names.js';

describe('names utilities', () => {
  // -----------------------------------------------------------------------
  // UNIT: individual converters
  // -----------------------------------------------------------------------

  describe('toKebab', () => {
    it('converts a simple string', () => {
      assert.equal(toKebab('myFeature'), 'myfeature');
    });

    it('handles multi-word with spaces', () => {
      assert.equal(toKebab('My Feature Name'), 'my-feature-name');
    });

    it('handles underscores', () => {
      assert.equal(toKebab('my_feature_name'), 'my-feature-name');
    });

    it('handles mixed separators', () => {
      assert.equal(toKebab('my_feature-name Test'), 'my-feature-name-test');
    });

    it('removes leading/trailing dashes', () => {
      assert.equal(toKebab('-my-feature-'), 'my-feature');
    });

    it('strips non-alphanumeric characters except dashes/spaces/underscores', () => {
      assert.equal(toKebab('my@feature!name#'), 'myfeaturename');
    });

    it('trims whitespace', () => {
      assert.equal(toKebab('  my feature  '), 'my-feature');
    });
  });

  describe('toCamel', () => {
    it('converts kebab input', () => {
      assert.equal(toCamel('my-feature'), 'myFeature');
    });

    it('converts single word', () => {
      assert.equal(toCamel('feature'), 'feature');
    });

    it('handles already camelCase', () => {
      assert.equal(toCamel('myFeature'), 'myfeature');
    });
  });

  describe('toPascal', () => {
    it('capitalizes the first letter of camelCase', () => {
      assert.equal(toPascal('my-feature'), 'MyFeature');
    });

    it('handles single word', () => {
      assert.equal(toPascal('feature'), 'Feature');
    });
  });

  describe('toTitle', () => {
    it('capitalizes each word', () => {
      assert.equal(toTitle('my-feature-name'), 'My Feature Name');
    });

    it('handles single word', () => {
      assert.equal(toTitle('feature'), 'Feature');
    });
  });

  describe('toConstant', () => {
    it('converts to UPPER_SNAKE_CASE', () => {
      assert.equal(toConstant('my-feature'), 'MY_FEATURE');
    });

    it('handles single word', () => {
      assert.equal(toConstant('feature'), 'FEATURE');
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: generateNames
  // -----------------------------------------------------------------------

  describe('generateNames', () => {
    it('produces all derived names from a raw input', () => {
      const names = generateNames('Support Cases');
      assert.equal(names.raw, 'Support Cases');
      assert.equal(names.kebab, 'support-cases');
      assert.equal(names.camel, 'supportCases');
      assert.equal(names.pascal, 'SupportCases');
      assert.equal(names.title, 'Support Cases');
      assert.equal(names.constant, 'SUPPORT_CASES');
    });

    it('handles complex multi-word input', () => {
      const names = generateNames('User Profile Settings v2');
      assert.equal(names.kebab, 'user-profile-settings-v2');
      assert.equal(names.pascal, 'UserProfileSettingsV2');
      assert.equal(names.camel, 'userProfileSettingsV2');
    });
  });

  describe('findAdjacentOwner', () => {
    const owners = [
      { name: 'user-app', root: 'apps/frontend/app' },
      { name: '@app/backend-feature-invoices-main', root: 'libs/backend/feature/invoices/main/lib' },
    ];

    it('finds clone-style variants through project names and ownership paths', () => {
      assert.equal(findAdjacentOwner('user-app-v2', owners), 'user-app');
      assert.equal(findAdjacentOwner('invoices-new', owners), '@app/backend-feature-invoices-main');
      assert.equal(findAdjacentOwner('invoices-new-v2', owners), '@app/backend-feature-invoices-main');
      assert.equal(findAdjacentOwner('copy-of-invoices', owners), '@app/backend-feature-invoices-main');
    });

    it('does not reject a version-like name without an existing base owner', () => {
      assert.equal(findAdjacentOwner('protocol-v2', owners), null);
    });
  });

  describe('cloneStyleBaseName', () => {
    it('removes repeated clone prefixes and suffixes', () => {
      assert.equal(cloneStyleBaseName('customer-portal-new-v2-copy'), 'customer-portal');
      assert.equal(cloneStyleBaseName('new-copy-of-customer-portal'), 'customer-portal');
    });
  });

  // -----------------------------------------------------------------------
  // E2E: validateName
  // -----------------------------------------------------------------------

  describe('validateName', () => {
    it('rejects empty strings', () => {
      assert.ok(validateName('') !== null);
    });

    it('rejects whitespace-only strings', () => {
      assert.ok(validateName('   ') !== null);
    });

    it('rejects strings with only special characters', () => {
      assert.ok(validateName('@#$') !== null);
    });

    it('accepts valid kebab-case names', () => {
      assert.equal(validateName('my-feature'), null);
    });

    it('accepts PascalCase names', () => {
      assert.equal(validateName('MyFeature'), null);
    });

    it('accepts names with numbers', () => {
      assert.equal(validateName('feature-v2'), null);
    });

    it('accepts single-word names', () => {
      assert.equal(validateName('admin'), null);
    });
  });
});
