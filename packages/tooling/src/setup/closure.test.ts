// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSelectedClosure,
  providerExternalPackages,
  renderSelectedClosure,
  type ProjectGraphLike,
} from './closure.js';

const digest = 'a'.repeat(64);

function graph(
  options: {
    dependencies?: ProjectGraphLike['dependencies'];
    externalPackages?: string[];
    projects?: Record<string, string[]>;
    toolingPackages?: string[];
  } = {},
): ProjectGraphLike {
  const projects = options.projects ?? { 'landing-app': ['build', 'serve'] };
  const nodes = Object.fromEntries(
    Object.entries(projects).map(([name, targets]) => [
      name,
      { data: { targets: Object.fromEntries(targets.map((t) => [t, {}])) } },
    ]),
  );
  const packageNames = new Set([
    '@eslint/js',
    '@nx/devkit',
    '@nx/eslint',
    '@nx/eslint-plugin',
    '@nx/js',
    '@nx/react',
    '@nx/vite',
    '@swc/helpers',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-sonarjs',
    'jiti',
    'jsdom',
    'jsonc-eslint-parser',
    'nx',
    'typescript',
    'typescript-eslint',
    'typescript-transform-paths',
    'zod',
    ...(options.externalPackages ?? []),
    ...(options.toolingPackages ?? []),
    ...Object.values(options.dependencies ?? {}).flatMap((dependencies) =>
      dependencies.filter(({ target }) => target.startsWith('npm:')).map(({ target }) => target.slice(4)),
    ),
  ]);
  const externalNodes = Object.fromEntries(
    [...packageNames].map((name) => [`npm:${name}`, { data: { packageName: name, version: '1.0.0' } }]),
  );
  return {
    nodes,
    externalNodes,
    dependencies: {
      ...Object.fromEntries(Object.keys(nodes).map((name) => [name, []])),
      '@repo/tooling': (options.toolingPackages ?? []).map((name) => ({ target: `npm:${name}` })),
      ...(options.dependencies ?? {}),
    },
  };
}

describe('selected closure', () => {
  it('builds a deterministic provider-free project, target, service, release image, and package closure', () => {
    const fixture = graph({
      projects: {
        'landing-app': ['serve', 'build', 'lint', 'typecheck', 'test', 'e2e'],
        '@app/common-config': ['build', 'lint', 'typecheck', 'test', 'component-test'],
      },
      dependencies: {
        'landing-app': [{ target: '@app/common-config' }, { target: 'npm:react' }],
        '@app/common-config': [{ target: 'npm:zod' }],
      },
    });
    const first = buildSelectedClosure(fixture, {
      apps: ['landing-app'],
      capabilities: [],
      configHash: digest,
    });
    const second = buildSelectedClosure(fixture, {
      apps: ['landing-app'],
      capabilities: [],
      configHash: digest,
    });

    assert.deepEqual(first, second);
    assert.equal(first.provider, null);
    assert.deepEqual(first.roots, ['landing-app']);
    assert.deepEqual(first.projects, ['@app/common-config', 'landing-app']);
    assert.deepEqual(first.targets.build, ['landing-app']);
    assert.deepEqual(first.targets.lint, ['@app/common-config', 'landing-app']);
    assert.deepEqual(first.targets.typecheck, ['@app/common-config', 'landing-app']);
    assert.deepEqual(first.targets.test, ['@app/common-config', 'landing-app']);
    assert.deepEqual(first.targets['component-test'], ['@app/common-config']);
    assert.deepEqual(first.targets.e2e, ['landing-app']);
    assert.deepEqual(first.targets.serve, ['landing-app']);
    assert.deepEqual(first.services, ['landing-app']);
    assert.deepEqual(first.releaseImages, ['landing-app']);
    assert.deepEqual(first.productExternalPackages, {
      react: '1.0.0',
      zod: '1.0.0',
    });
    assert.deepEqual(first.toolingExternalPackages, {
      '@eslint/js': '1.0.0',
      '@nx/devkit': '1.0.0',
      '@nx/eslint': '1.0.0',
      '@nx/eslint-plugin': '1.0.0',
      '@nx/js': '1.0.0',
      '@nx/react': '1.0.0',
      '@nx/vite': '1.0.0',
      '@swc/helpers': '1.0.0',
      '@typescript-eslint/eslint-plugin': '1.0.0',
      '@typescript-eslint/parser': '1.0.0',
      eslint: '1.0.0',
      'eslint-config-prettier': '1.0.0',
      'eslint-plugin-sonarjs': '1.0.0',
      jiti: '1.0.0',
      jsdom: '1.0.0',
      'jsonc-eslint-parser': '1.0.0',
      nx: '1.0.0',
      typescript: '1.0.0',
      'typescript-eslint': '1.0.0',
      'typescript-transform-paths': '1.0.0',
    });
    const serialized = JSON.parse(renderSelectedClosure(first)) as Record<string, unknown>;
    assert.equal(serialized.externalPackages, undefined);
    assert.deepEqual(serialized.productExternalPackages, first.productExternalPackages);
    assert.deepEqual(serialized.toolingExternalPackages, first.toolingExternalPackages);
  });

  it('includes available DefinitelyTyped companions for selected runtime packages', () => {
    const selected = buildSelectedClosure(
      graph({
        dependencies: { 'landing-app': [{ target: 'npm:string-format' }] },
        externalPackages: ['@types/string-format'],
      }),
      { apps: ['landing-app'], capabilities: [], configHash: digest },
    );

    assert.equal(selected.productExternalPackages?.['string-format'], '1.0.0');
    assert.equal(selected.productExternalPackages?.['@types/string-format'], '1.0.0');
  });

  it('does not expose non-Compose e2e roots as services', () => {
    const fixture = graph({ projects: { 'fullstack-e2e': ['test', 'e2e'] } });
    const selected = buildSelectedClosure(fixture, {
      apps: ['fullstack-e2e'],
      capabilities: [],
      configHash: digest,
    });
    assert.deepEqual(selected.services, []);
  });

  it('includes selected PostgreSQL capability ownership and excludes MongoDB packages', () => {
    const fixture = graph({
      projects: {
        'user-app-api': ['build', 'serve'],
        '@app/backend-postgres-main': ['build'],
        '@app/backend-postgres-main-auth': ['build'],
      },
      dependencies: {
        'user-app-api': [{ target: 'npm:@nestjs/common' }],
        '@app/backend-postgres-main': [{ target: 'npm:@opentelemetry/instrumentation-pg' }, { target: 'npm:pg' }],
        '@app/backend-postgres-main-auth': [{ target: '@app/backend-postgres-main' }],
      },
    });
    const closure = buildSelectedClosure(fixture, {
      apps: ['user-app-api'],
      capabilities: ['postgres'],
      configHash: digest,
    });
    assert.equal(closure.provider, 'postgres');
    assert.ok(closure.projects.includes('@app/backend-postgres-main-auth'));
    assert.equal(closure.productExternalPackages?.pg, '1.0.0');
    assert.equal(closure.productExternalPackages?.['@opentelemetry/instrumentation-pg'], '1.0.0');
    assert.equal(closure.productExternalPackages?.['@opentelemetry/instrumentation-mongodb'], undefined);
    assertNoProviderPackages(closure.productExternalPackages, providerExternalPackages('mongodb'));
    assert.deepEqual(closure.releaseImages, ['migrator', 'user-app-api']);
    assert.ok(closure.services.includes('migrate'));
  });

  it('includes selected MongoDB capability ownership and excludes PostgreSQL packages', () => {
    const fixture = graph({
      projects: {
        'user-app-api': ['build', 'serve'],
        '@app/backend-mongodb-main': ['build'],
        '@app/backend-mongodb-main-auth': ['build'],
      },
      dependencies: {
        '@app/backend-mongodb-main': [
          { target: 'npm:@opentelemetry/instrumentation-mongodb' },
          { target: 'npm:mongodb' },
        ],
        '@app/backend-mongodb-main-auth': [{ target: '@app/backend-mongodb-main' }],
      },
    });
    const closure = buildSelectedClosure(fixture, {
      apps: ['user-app-api'],
      capabilities: ['mongodb'],
      configHash: digest,
    });
    assert.equal(closure.provider, 'mongodb');
    assert.equal(closure.productExternalPackages?.mongodb, '1.0.0');
    assert.equal(closure.productExternalPackages?.['@opentelemetry/instrumentation-mongodb'], '1.0.0');
    assert.equal(closure.productExternalPackages?.['@opentelemetry/instrumentation-pg'], undefined);
    assertNoProviderPackages(closure.productExternalPackages, providerExternalPackages('postgres'));
    assert.deepEqual(closure.releaseImages, ['migrator', 'user-app-api']);
    assert.ok(closure.services.includes('mongodb-migrate'));
  });

  it('rejects opposite-provider project and package edges instead of filtering them', () => {
    const projectLeak = graph({
      projects: {
        'user-app-api': ['build'],
        '@app/backend-postgres-main': ['build'],
        '@app/backend-postgres-main-auth': ['build'],
        '@app/backend-mongodb-main': ['build'],
      },
      dependencies: {
        'user-app-api': [{ target: '@app/backend-mongodb-main' }],
      },
    });
    assert.throws(
      () =>
        buildSelectedClosure(projectLeak, { apps: ['user-app-api'], capabilities: ['postgres'], configHash: digest }),
      /opposite database provider project/,
    );

    const packageLeak = graph({
      projects: {
        'user-app-api': ['build'],
        '@app/backend-postgres-main': ['build'],
        '@app/backend-postgres-main-auth': ['build'],
      },
      dependencies: {
        'user-app-api': [{ target: 'npm:mongodb' }],
      },
    });
    assert.throws(
      () =>
        buildSelectedClosure(packageLeak, { apps: ['user-app-api'], capabilities: ['postgres'], configHash: digest }),
      /opposite database provider package/,
    );
  });

  it('rejects an unselected application reached through the Nx graph', () => {
    const fixture = graph({
      projects: { 'landing-app': ['build'], 'site-app': ['build'] },
      dependencies: { 'landing-app': [{ target: 'site-app' }] },
    });
    assert.throws(
      () => buildSelectedClosure(fixture, { apps: ['landing-app'], capabilities: [], configHash: digest }),
      /unselected application/,
    );
  });
});

function assertNoProviderPackages(
  packages: Readonly<Record<string, string>> | undefined,
  forbidden: ReadonlySet<string>,
): void {
  assert.deepEqual(
    Object.keys(packages ?? {}).filter((name) => forbidden.has(name)),
    [],
  );
}
