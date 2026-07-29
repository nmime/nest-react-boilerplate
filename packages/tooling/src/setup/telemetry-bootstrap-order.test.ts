import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { backendCapabilityModuleCatalog } from './catalog.js';
import { generateBackendCapabilityBootstrap } from './planner.js';
import { planSummaryFixture } from './test-fixtures.js';

const require = createRequire(import.meta.url);
const workspaceRoot = process.cwd();

describe('backend telemetry bootstrap ordering', () => {
  it('registers selected instrumentation before the PostgreSQL or MongoDB driver evaluates', () => {
    const cases = [
      {
        provider: 'postgres',
        driver: 'pg',
        instrumentationName: '@opentelemetry/instrumentation-pg',
        instrumentationAlias: '@app/backend-postgres-main-otel',
        instrumentationSource: 'libs/backend/postgres/main/shared/lib/src/postgres-otel.instrumentation.ts',
      },
      {
        provider: 'mongodb',
        driver: 'mongodb',
        instrumentationName: '@opentelemetry/instrumentation-mongodb',
        instrumentationAlias: '@app/backend-mongodb-main-otel',
        instrumentationSource: 'libs/backend/mongodb/main/shared/lib/src/mongo-otel.instrumentation.ts',
      },
    ] as const;

    for (const testCase of cases) {
      const root = mkdtempSync(join(tmpdir(), `nrb-otel-order-${testCase.provider}-`));
      try {
        const generated = generateBackendCapabilityBootstrap(
          'user-app-api',
          planSummaryFixture({
            apps: ['user-app-api'],
            capabilities: ['otel', testCase.provider],
            configHash: testCase.provider,
          }),
        );
        writeFileSync(join(root, 'capabilities.bootstrap.generated.ts'), generated.content);
        writeFileSync(join(root, 'otel.fixture.ts'), otelFixtureSource);
        writeFileSync(join(root, 'app.module.ts'), appModuleFixtureSource(testCase.driver));
        writeFileSync(join(root, 'main.ts'), processFixtureSource);

        const driverEntry = require.resolve(testCase.driver);
        const aliases = {
          '@app/backend-common-otel': join(root, 'otel.fixture.ts'),
          [testCase.instrumentationAlias]: resolve(workspaceRoot, testCase.instrumentationSource),
          [testCase.driver]: driverEntry,
        };
        const result = spawnSync(process.execPath, ['--import', 'jiti/register', join(root, 'main.ts')], {
          cwd: workspaceRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            JITI_ALIAS: JSON.stringify(aliases),
            TEST_DRIVER_ENTRY: driverEntry,
            TEST_INSTRUMENTATION_NAME: testCase.instrumentationName,
          },
        });

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.equal(result.stdout, `registered:${testCase.instrumentationName}\nmodule:${testCase.driver}\n`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('keeps every checked-in backend entrypoint free of static app and Nest bootstrap imports', () => {
    for (const entry of Object.values(backendCapabilityModuleCatalog)) {
      if (!entry) {
        continue;
      }
      const mainPath = resolve(workspaceRoot, dirname(entry.path), 'main.ts');
      const source = readFileSync(mainPath, 'utf8');
      const staticImports = [...source.matchAll(/^import .* from ['"]([^'"]+)['"];$/gmu)].map((match) => match[1]);

      assert.deepEqual(staticImports, ['./capabilities.bootstrap.generated'], mainPath);
      assert.match(source, /initializeCapabilities\([^)]*\);[\s\S]*await Promise\.all\(/u, mainPath);
      assert.match(source, /import\(['"]\.\/bootstrap\.runtime['"]\)/u, mainPath);
      assert.match(source, /import\(['"]\.\/[^'"]+\.module['"]\)/u, mainPath);
    }
  });
});

const otelFixtureSource = `
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function createOpenTelemetryInstrumentations(providerInstrumentations: unknown[] = []): unknown[] {
  return providerInstrumentations;
}

export function initOpenTelemetry(options: { instrumentations?: Array<{ instrumentationName?: string }> }): void {
  const driverEntry = process.env.TEST_DRIVER_ENTRY;
  const expectedInstrumentation = process.env.TEST_INSTRUMENTATION_NAME;
  if (!driverEntry || !expectedInstrumentation) {
    throw new Error('Telemetry order fixture environment is incomplete.');
  }
  if (require.cache[driverEntry]) {
    throw new Error('Database driver evaluated before telemetry registration.');
  }
  const names = options.instrumentations?.map((instrumentation) => instrumentation.instrumentationName) ?? [];
  if (!names.includes(expectedInstrumentation)) {
    throw new Error('Selected provider instrumentation was not registered.');
  }
  (globalThis as typeof globalThis & { telemetryRegistered?: boolean }).telemetryRegistered = true;
  process.stdout.write(\`registered:\${expectedInstrumentation}\\n\`);
}
`;

function appModuleFixtureSource(driver: string): string {
  return `
import '${driver}';

if (!(globalThis as typeof globalThis & { telemetryRegistered?: boolean }).telemetryRegistered) {
  throw new Error('Application module evaluated before telemetry registration.');
}
process.stdout.write('module:${driver}\\n');
`;
}

const processFixtureSource = `
import { initializeCapabilities } from './capabilities.bootstrap.generated';

async function bootstrap(): Promise<void> {
  initializeCapabilities('order-test');
  await import('./app.module');
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
`;
