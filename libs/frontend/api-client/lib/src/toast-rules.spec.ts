// @requirements REQ-API-CLIENT-005
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseGeneratedToastRules } from './toast-rules/generated-config';
import compactAuthConfig from './generated/toast/auth-app-api.toast-rules.frontend.generated.json';

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
    expect(
      [...new Set(apiToastRuleCatalog.map((rule) => rule.app))].sort((left, right) => left.localeCompare(right)),
    ).toEqual(['admin-app-api', 'auth-app-api', 'user-app-api']);
  });
});

interface SourceRule {
  id: string;
  enabled: boolean;
  endpoint: { app: string; operationId: string | null; path: string; method: string; tags: string[] };
  status: number | string;
  errorCode: string | null;
  display: { mode: string; category: string; text: { default: string } };
}

it.each([
  ['admin', adminApiToastRules],
  ['auth', authApiToastRules],
  ['user', userApiToastRules],
] as const)(
  'preserves every %s rule and presentation against the canonical backend catalog',
  (service, runtimeRules) => {
    const source = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          `../../../../../apps/backend/${service}/${service}-app-api/contracts/toast/${service}-app-api.toast-rules.generated.json`,
        ),
        'utf8',
      ),
    ) as { rules: SourceRule[] };
    expect(runtimeRules).toHaveLength(source.rules.length);
    for (const rule of source.rules) {
      expect(runtimeRules.find((candidate) => candidate.id === rule.id)).toMatchObject({
        display: rule.enabled ? rule.display.mode : 'silent',
        match: {
          endpoint: rule.endpoint.path,
          method: rule.endpoint.method,
          ...(typeof rule.status === 'number' ? { status: rule.status } : {}),
          ...(rule.errorCode ? { code: rule.errorCode } : {}),
        },
        toast: {
          category: rule.display.category,
          messageSource: 'problem',
          titleKey:
            typeof rule.status === 'number' && rule.status >= 500
              ? 'ui.runtime.serverUnavailable.title'
              : 'ui.runtime.requestFailed.title',
        },
      });
      expect(apiToastRuleCatalog.find((candidate) => candidate.id === rule.id)).toEqual({
        id: rule.id,
        app: rule.endpoint.app,
        errorCode: rule.errorCode,
        operationId: rule.endpoint.operationId,
        path: rule.endpoint.path,
        method: rule.endpoint.method,
        status: rule.status,
        tags: rule.endpoint.tags,
        defaultDisplay: rule.enabled ? rule.display.mode : 'silent',
        defaultMessage: rule.display.text.default,
        defaultSeverity: rule.display.category,
      });
    }
  },
);

it('retains fail-closed runtime parsing for malformed generated rules', () => {
  const valid = compactAuthConfig.rules[0]!;
  expect(
    parseGeneratedToastRules({
      ...compactAuthConfig,
      rules: [
        { ...valid, id: '' },
        { ...valid, toast: { category: 'invalid' } },
      ],
    }),
  ).toEqual([]);
});
