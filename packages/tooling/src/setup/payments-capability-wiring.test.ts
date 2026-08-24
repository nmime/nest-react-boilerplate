// @requirements REQ-SCAFFOLD-SELECTION-002
// Evidence for: REQ-SCAFFOLD-SELECTION-002
/**
 * Payments capability wiring list — catalog entry, planner resolution, and the
 * committed workspace state.
 *
 * Proves the wiring contract of the `payments` setup capability end to end:
 * - UNIT: the `payments` catalog entry (activation, durable-database
 *   requirement, project ownership, DDL, provider backend wiring for both
 *   persistence axes);
 * - COMPONENT: `hosts: 'selected-backend'` resolves the wiring into exactly the
 *   backends the selection names, and the entry stays host-neutral for a
 *   product that selects the unselected backends;
 * - E2E: the committed generated `capabilities.generated.ts` of each selected
 *   backend carries exactly that wiring, the two unselected backends carry none,
 *   `PaymentsAdminModule` is hand-imported only in admin-app-api, the scaffold
 *   migration is in the capability migration registry, and replanning the
 *   committed selection converges to zero operations.
 *
 * Runs with `node --test --import jiti/register`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { baseCapabilityIds } from './capability-registry.js';
import { capabilityCatalog } from './catalog.js';
import { generateBackendCapabilityModule, plan } from './planner.js';
import { migrateState } from './state.js';
import { parseNrbConfig, schemaVersion, type AppId } from './schema.js';
import { planSummaryFixture } from './test-fixtures.js';

const workspaceRoot = new URL('../../../../', import.meta.url);

const SELECTED_BACKENDS = [
  'admin-app-api',
  'auth-app-api',
  'user-app-api',
  'notification-consumer',
  'notification-scheduler',
] as const;

const UNSELECTED_BACKENDS = ['discord-app-api', 'telegram-bot-api'] as const;

const GENERATED_MODULE_PATHS: Record<string, string> = {
  'admin-app-api': 'apps/backend/admin/admin-app-api/src/capabilities.generated.ts',
  'auth-app-api': 'apps/backend/auth/auth-app-api/src/capabilities.generated.ts',
  'user-app-api': 'apps/backend/user/user-app-api/src/capabilities.generated.ts',
  'notification-consumer': 'apps/backend/notification/notification-consumer/src/capabilities.generated.ts',
  'notification-scheduler': 'apps/backend/notification/notification-scheduler/src/capabilities.generated.ts',
  'discord-app-api': 'apps/backend/discord/discord-app-api/src/capabilities.generated.ts',
  'telegram-bot-api': 'apps/backend/telegram/telegram-bot-api/src/capabilities.generated.ts',
};

const ROOT_MODULE_PATHS: Record<string, string> = {
  'admin-app-api': 'apps/backend/admin/admin-app-api/src/admin-app-api.module.ts',
  'auth-app-api': 'apps/backend/auth/auth-app-api/src/auth-app-api.module.ts',
  'user-app-api': 'apps/backend/user/user-app-api/src/user-app-api.module.ts',
  'notification-consumer': 'apps/backend/notification/notification-consumer/src/notification-consumer.module.ts',
  'notification-scheduler': 'apps/backend/notification/notification-scheduler/src/notification-scheduler.module.ts',
  'discord-app-api': 'apps/backend/discord/discord-app-api/src/discord-app-api.module.ts',
  'telegram-bot-api': 'apps/backend/telegram/telegram-bot-api/src/telegram-bot-api.module.ts',
};

const PAYMENTS_MODULE_EXPRESSION =
  'PaymentsMainModule.forRoot({ imports: [PaymentsPostgresModule], exposeHttp: true, scheduler: { enabled: true, intervalMs: 60_000 } })';

const POSTGRES_WIRING = {
  hosts: 'selected-backend',
  importName: 'PaymentsMainModule',
  importPath: '@app/backend-feature-payments-main',
  additionalImports: [{ importName: 'PaymentsPostgresModule', importPath: '@app/backend-postgres-main-payments' }],
  moduleExpression: PAYMENTS_MODULE_EXPRESSION,
} as const;

describe('payments capability — catalog entry', () => {
  it('activates as a nest module that requires a durable database', () => {
    const entry = capabilityCatalog['payments'];
    assert.equal(entry.id, 'payments');
    assert.equal(entry.activation, 'nest-module');
    assert.equal(entry.requiresDurableDatabase, true);
    assert.deepEqual(entry.requiresCapabilities, []);
    assert.deepEqual(entry.conflictsWith, []);
  });

  it('owns the shared and main libs and both persistence-axis data-access projects', () => {
    const entry = capabilityCatalog['payments'];
    assert.deepEqual(entry.ownedProjects, [
      '@app/backend-feature-payments-shared',
      '@app/backend-feature-payments-main',
    ]);
    assert.deepEqual(entry.providerOwnedProjects, {
      postgres: ['@app/backend-postgres-main-payments'],
      mongodb: ['@app/backend-mongodb-main-payments'],
    });
  });

  it('carries the payments DDL with the capability', () => {
    assert.deepEqual(capabilityCatalog['payments'].providerMigrations, {
      postgres: [
        {
          importName: 'Migration20260823100000CreatePayments',
          importPath:
            '../../../../../libs/backend/postgres/main/payments/lib/src/infrastructure/data-access/migrations/Migration20260823100000CreatePayments.ts',
        },
      ],
    });
  });

  it('wires the postgres axis into every selected backend with the persistence module handed in as an import', () => {
    const wiring = capabilityCatalog['payments'].providerBackendWiring;
    assert.ok(wiring);
    assert.deepEqual(wiring.postgres, [POSTGRES_WIRING]);
  });

  it('keeps a reference wiring for the mongodb axis without naming it in the main lib', () => {
    const wiring = capabilityCatalog['payments'].providerBackendWiring;
    assert.ok(wiring);
    assert.equal(wiring.mongodb?.length, 1);
    const mongo = wiring.mongodb?.[0];
    assert.equal(mongo?.hosts, 'selected-backend');
    assert.equal(mongo?.importName, 'PaymentsMainModule');
    assert.equal(mongo?.importPath, '@app/backend-feature-payments-main');
    assert.deepEqual(mongo?.additionalImports, [
      { importName: 'PaymentsMongoModule', importPath: '@app/backend-mongodb-main-payments' },
    ]);
    assert.match(
      mongo?.moduleExpression ?? '',
      /PaymentsMainModule\.forRoot\(\{ imports: \[PaymentsMongoModule\], exposeHttp: true, scheduler: \{ enabled: true, intervalMs: 60_000 \} \}\)/,
    );
  });

  it('is registered as a base capability id', () => {
    assert.ok((baseCapabilityIds as readonly string[]).includes('payments'));
  });
});

describe('payments capability — planner wiring list', () => {
  const summary = planSummaryFixture({ apps: [...SELECTED_BACKENDS], capabilities: ['payments', 'postgres'] });

  for (const appId of SELECTED_BACKENDS) {
    it(`wires ${appId} with the payments postgres expression`, () => {
      const { path, content } = generateBackendCapabilityModule(appId as AppId, summary);
      assert.equal(path, GENERATED_MODULE_PATHS[appId]);
      assert.match(content, /import \{ PaymentsMainModule \} from '@app\/backend-feature-payments-main';/u);
      assert.match(content, /import \{ PaymentsPostgresModule \} from '@app\/backend-postgres-main-payments';/u);
      // The module list renders inline when it fits the generated print width, so assert the
      // expression and the export membership without pinning the line layout.
      assert.ok(content.includes(`${PAYMENTS_MODULE_EXPRESSION},`), 'postgres module expression in imports list');
      assert.match(content, /exports: \[[^\]]*PaymentsMainModule[^\]]*\],/u);
    });
  }

  for (const appId of UNSELECTED_BACKENDS) {
    it(`leaves ${appId} unwired when the selection does not name it`, () => {
      const { content } = generateBackendCapabilityModule(appId as AppId, summary);
      assert.doesNotMatch(content, /Payments/u);
    });
  }

  it('stays host-neutral: a product selecting discord inherits the same wiring', () => {
    const discordSummary = planSummaryFixture({ apps: ['discord-app-api'], capabilities: ['payments', 'postgres'] });
    const { content } = generateBackendCapabilityModule('discord-app-api' as AppId, discordSummary);
    assert.ok(content.includes(`${PAYMENTS_MODULE_EXPRESSION},`), 'discord receives the identical expression');
  });
});

describe('payments capability — committed workspace wiring list', () => {
  it('selects payments in nrb.config.json', () => {
    const config = JSON.parse(readFileSync(new URL('nrb.config.json', workspaceRoot), 'utf8')) as {
      capabilities: string[];
    };
    assert.ok(config.capabilities.includes('payments'));
  });

  for (const appId of SELECTED_BACKENDS) {
    it(`carries the payments wiring in ${appId}'s generated capability module`, () => {
      const content = readFileSync(new URL(GENERATED_MODULE_PATHS[appId], workspaceRoot), 'utf8');
      assert.match(content, /import \{ PaymentsMainModule \} from '@app\/backend-feature-payments-main';/u);
      assert.match(content, /import \{ PaymentsPostgresModule \} from '@app\/backend-postgres-main-payments';/u);
      assert.ok(content.includes(`    ${PAYMENTS_MODULE_EXPRESSION},\n`));
    });
  }

  for (const appId of UNSELECTED_BACKENDS) {
    it(`carries no payments wiring in ${appId}'s generated capability module`, () => {
      const content = readFileSync(new URL(GENERATED_MODULE_PATHS[appId], workspaceRoot), 'utf8');
      assert.doesNotMatch(content, /Payments/u);
    });
  }

  it('hand-imports PaymentsAdminModule only in admin-app-api, where the admin guard and audit interceptor live', () => {
    const admin = readFileSync(new URL(ROOT_MODULE_PATHS['admin-app-api'], workspaceRoot), 'utf8');
    assert.match(admin, /import \{ PaymentsAdminModule \} from '@app\/backend-feature-payments-admin';/u);
    assert.match(admin, /\n    PaymentsAdminModule,\n/u);
    assert.match(admin, /APP_GUARD/u);
    assert.match(admin, /APP_INTERCEPTOR/u);
    for (const appId of [...SELECTED_BACKENDS.filter((id) => id !== 'admin-app-api'), ...UNSELECTED_BACKENDS]) {
      const root = readFileSync(new URL(ROOT_MODULE_PATHS[appId], workspaceRoot), 'utf8');
      assert.doesNotMatch(root, /PaymentsAdminModule/u);
    }
  });

  it('registers the payments scaffold migration in the capability migration registry', () => {
    const content = readFileSync(
      new URL('packages/tooling/src/commands/db/capability-migrations.generated.ts', workspaceRoot),
      'utf8',
    );
    assert.match(content, /import \{ Migration20260823100000CreatePayments \} from/u);
    assert.match(
      content,
      /\{ class: Migration20260823100000CreatePayments, name: 'Migration20260823100000CreatePayments' \}/u,
    );
  });

  it('replans the committed selection to zero operations (repeatable selection converges)', () => {
    const rawConfig = JSON.parse(readFileSync(new URL('nrb.config.json', workspaceRoot), 'utf8'));
    const rawState = JSON.parse(readFileSync(new URL('.nrb/state.json', workspaceRoot), 'utf8'));
    const result = plan(parseNrbConfig({ ...rawConfig }), migrateState(rawState));
    assert.equal(result.summary.capabilities.includes('payments'), true);
    assert.deepEqual(result.operations, []);
    assert.equal(schemaVersion, rawConfig.schemaVersion);
  });
});
