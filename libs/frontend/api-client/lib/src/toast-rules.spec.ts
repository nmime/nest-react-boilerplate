// @requirements REQ-API-CLIENT-005
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { adminApiToastRules, apiToastRuleCatalog, authApiToastRules, userApiToastRules } from './toast-rules';

const moduleSource = (name: string): string => readFileSync(join(import.meta.dirname, 'toast-rules', name), 'utf8');

const generatedCatalogImports = (source: string): string[] =>
  [...source.matchAll(/generated\/toast\/([\w.-]+)\.toast-rules\.frontend\.generated\.json/gu)].map(
    (match) => match[1] ?? '',
  );

describe('per-service toast rule modules', () => {
  it.each([
    ['admin.ts', 'admin-app-api'],
    ['auth.ts', 'auth-app-api'],
    ['user.ts', 'user-app-api'],
  ])('keeps %s bound to only the %s catalog', (fileName, app) => {
    expect(generatedCatalogImports(moduleSource(fileName))).toEqual([app]);
  });

  it.each(['admin.ts', 'auth.ts', 'user.ts', 'catalog.ts'])(
    'annotates the %s rule set as pure so a bundler may drop an unused app catalog',
    (fileName) => {
      expect(moduleSource(fileName)).toContain('/* @__PURE__ */');
    },
  );

  it('keeps the cross-app presentation catalog out of the per-service modules', () => {
    expect(generatedCatalogImports(moduleSource('catalog.ts'))).toEqual([
      'admin-app-api',
      'auth-app-api',
      'user-app-api',
    ]);
  });

  it('parses each service rule set from its own generated catalog', () => {
    expect(adminApiToastRules.length).toBeGreaterThan(0);
    expect(authApiToastRules.length).toBeGreaterThan(0);
    expect(userApiToastRules.length).toBeGreaterThan(0);
  });

  it('keeps the presentation catalog spanning every service', () => {
    expect([...new Set(apiToastRuleCatalog.map((rule) => rule.app))].sort()).toEqual([
      'admin-app-api',
      'auth-app-api',
      'user-app-api',
    ]);
  });
});
