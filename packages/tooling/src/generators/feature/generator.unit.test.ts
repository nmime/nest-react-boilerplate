// @requirements REQ-SCAFFOLD-GENERATORS-003
// Evidence for: REQ-SCAFFOLD-GENERATORS-003
/**
 * Tests for the feature generator.
 *
 * UNIT: name validation, api-app validation, conflict detection
 * COMPONENT: generator + tree integration (template files)
 * E2E: full feature generation on in-memory tree, dry-run, duplicate rejection
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  const tree = createTreeWithEmptyWorkspace();
  tree.write(
    'apps/backend/user/user-app-api/project.json',
    JSON.stringify({
      name: 'user-app-api',
      root: 'apps/backend/user/user-app-api',
      sourceRoot: 'apps/backend/user/user-app-api/src',
      tags: ['type:backend-app'],
    }),
  );
  tree.write(
    'apps/backend/user/user-app-api/src/main.ts',
    'import { bootstrapNestApi } from "@app/backend-common-bootstrap";\nvoid bootstrapNestApi(UserAppApiModule, { appName: "user-app-api", port: 3100 });\n',
  );
  tree.write(
    'apps/backend/user/user-app-api/src/user-app-api.module.ts',
    'import { Module } from "@nestjs/common";\n\n@Module({ imports: [], controllers: [], providers: [] })\nexport class UserAppApiModule {}\n',
  );
  tree.write(
    'apps/frontend/app/project.json',
    JSON.stringify({
      name: 'user-app',
      root: 'apps/frontend/app',
      sourceRoot: 'apps/frontend/app/src',
      tags: ['type:frontend-app'],
    }),
  );
  tree.write('apps/frontend/app/vite.config.mts', 'export default {};\n');
  tree.write(
    'packages/tooling/src/commands/db/orm-migration-config.ts',
    readFileSync(join(process.cwd(), 'packages/tooling/src/commands/db/orm-migration-config.ts'), 'utf8'),
  );
  return tree;
}

const featureTargets = { apiApp: 'user-app-api', frontendApp: 'user-app' } as const;

describe('feature generator', () => {
  // -----------------------------------------------------------------------
  // UNIT: validation
  // -----------------------------------------------------------------------

  describe('name validation', () => {
    it('rejects empty name', async () => {
      const tree = await createTree();
      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(() => featureGenerator(tree, { ...featureTargets, name: '' }), /Name must not be empty/);
    });

    it('rejects whitespace-only name', async () => {
      const tree = await createTree();
      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(() => featureGenerator(tree, { ...featureTargets, name: '   ' }), /Name must not be empty/);
    });
  });

  describe('api-app validation', () => {
    it('rejects invalid api-app when valid apps exist', async () => {
      const tree = await createTree();
      // Add a fake backend app to the tree
      tree.write(
        'apps/backend/user/user-app-api/project.json',
        JSON.stringify({
          name: 'user-app-api',
          root: 'apps/backend/user/user-app-api',
          tags: ['type:backend-app'],
        }),
      );
      // Also need a tsconfig.base.json for the tree
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(
        () => featureGenerator(tree, { ...featureTargets, name: 'test', apiApp: 'invalid-api' }),
        /Invalid --api-app/,
      );
    });

    it('requires explicit API and frontend owners', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(
        () => featureGenerator(tree, { name: 'invoices' } as never),
        /requires explicit --api-app and --frontend-app owners/,
      );
    });

    it('rejects non-HTTP backend and non-Vite frontend owners before writes', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));
      tree.write(
        'apps/backend/billing/billing-consumer/project.json',
        JSON.stringify({
          name: 'billing-consumer',
          root: 'apps/backend/billing/billing-consumer',
          sourceRoot: 'apps/backend/billing/billing-consumer/src',
          tags: ['type:backend-app'],
        }),
      );
      tree.write(
        'apps/backend/billing/billing-consumer/src/main.ts',
        'void NestFactory.createApplicationContext(BillingConsumerModule);\n',
      );
      tree.write(
        'apps/frontend/mobile/project.json',
        JSON.stringify({
          name: 'mobile-app',
          root: 'apps/frontend/mobile',
          sourceRoot: 'apps/frontend/mobile/src',
          tags: ['type:frontend-app'],
        }),
      );
      tree.write('apps/frontend/mobile/app.json', '{}\n');

      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(
        () =>
          featureGenerator(tree, {
            name: 'billing',
            apiApp: 'billing-consumer',
            frontendApp: 'user-app',
            skipFormat: true,
          }),
        /require a Nest API owner.*consumers and schedulers are not supported/,
      );
      await assert.rejects(
        () =>
          featureGenerator(tree, {
            name: 'billing',
            apiApp: 'user-app-api',
            frontendApp: 'mobile-app',
            skipFormat: true,
          }),
        /require a Vite web application.*Astro, Vike, and Expo owners are not supported/,
      );
      assert.equal(tree.exists('libs/backend/feature/billing/main/lib/project.json'), false);
    });

    it('fails before writes when production migration registration is unsupported', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));
      tree.delete('packages/tooling/src/commands/db/orm-migration-config.ts');

      const { featureGenerator } = await import('./generator.js');
      await assert.rejects(
        () => featureGenerator(tree, { ...featureTargets, name: 'billing', skipFormat: true }),
        /orm-migration-config\.ts is missing.*stopped before writes/i,
      );
      assert.equal(tree.exists('libs/backend/feature/billing/main/lib/project.json'), false);
      assert.deepEqual(JSON.parse(tree.read('tsconfig.base.json', 'utf8')!), { compilerOptions: { paths: {} } });
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: conflict detection
  // -----------------------------------------------------------------------

  describe('conflict detection', () => {
    it('rejects duplicate feature names without --force', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');

      // First generation succeeds
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      // Second generation should fail
      await assert.rejects(
        () => featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true }),
        /Refusing to overwrite/,
      );
    });

    it('rejects duplicate feature regeneration with --force', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');

      // First generation
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      await assert.rejects(
        () => featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true, force: true }),
        /Modify the existing feature owner in place/,
      );
    });

    it('rejects clone-style variants beside an existing feature owner', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      for (const name of ['invoices-new', 'invoices-v2', 'invoices-copy']) {
        await assert.rejects(
          () => featureGenerator(tree, { ...featureTargets, name, skipFormat: true }),
          /Modify the existing owner in place/,
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // E2E: full feature generation
  // -----------------------------------------------------------------------

  describe('full generation', () => {
    it('creates all backend feature files', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, {
        ...featureTargets,
        name: 'Support Cases',
        migrationTimestamp: '20260713000000',
        skipFormat: true,
      });

      // Shared library
      assert.ok(tree.exists('libs/backend/feature/support-cases/shared/lib/src/index.ts'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/shared/lib/project.json'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/shared/lib/tsconfig.lib.json'));

      // Main library
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/src/index.ts'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/src/support-cases.module.ts'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/src/support-cases.controller.ts'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/src/support-cases.service.ts'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/src/support-cases.service.spec.ts'));
      assert.match(
        tree.read('libs/backend/feature/support-cases/main/lib/src/support-cases.service.spec.ts', 'utf8')!,
        /^\/\/ @requirements REQ-SUPPORT-CASES-SCAFFOLD-001$/mu,
      );
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/project.json'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/tsconfig.lib.json'));
      const coverageConfig = tree.read('libs/backend/feature/support-cases/main/lib/vitest.config.mts', 'utf8')!;
      assert.ok(coverageConfig.includes('"coverage/libs/backend/feature/support-cases/main/lib"'));
      assert.equal(coverageConfig.includes('../coverage/'), false);

      // Postgres data access
      assert.ok(tree.exists('libs/backend/postgres/main/support-cases/lib/src/index.ts'));
      assert.ok(
        tree.exists(
          'libs/backend/postgres/main/support-cases/lib/src/infrastructure/data-access/entities/support-cases.entity.ts',
        ),
      );
      assert.ok(
        tree.exists(
          'libs/backend/postgres/main/support-cases/lib/src/infrastructure/data-access/repositories/support-cases.repository.ts',
        ),
      );
      assert.ok(
        tree.exists(
          'libs/backend/postgres/main/support-cases/lib/src/infrastructure/data-access/migrations/Migration20260713000000CreateSupportCases.ts',
        ),
      );
      assert.ok(tree.exists('libs/backend/postgres/main/support-cases/lib/src/support-cases-postgres.module.ts'));
      const migrationIndex = tree.read(
        'libs/backend/postgres/main/support-cases/lib/src/infrastructure/data-access/migrations/index.ts',
        'utf8',
      )!;
      assert.match(migrationIndex, /export const supportCasesMigrations = \[/u);
      const migrationRunner = tree.read('packages/tooling/src/commands/db/orm-migration-config.ts', 'utf8')!;
      assert.match(
        migrationRunner,
        /const \{ supportCasesMigrations \} = require\("@app\/backend-postgres-main-support-cases"\);/u,
      );
      assert.match(migrationRunner, /\.\.\.notificationMigrations, \.\.\.supportCasesMigrations/u);
      assert.ok(tree.exists('libs/backend/feature/support-cases/main/lib/AGENTS.md'));
      assert.ok(tree.exists('libs/backend/feature/support-cases/shared/lib/README.md'));
      assert.ok(tree.exists('libs/backend/postgres/main/support-cases/lib/AGENTS.md'));
    });

    it('registers sequential feature migration lists after formatting the production runner', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));
      const { featureGenerator } = await import('./generator.js');

      await featureGenerator(tree, {
        ...featureTargets,
        name: 'billing-ledger',
        migrationTimestamp: '20260713000001',
      });
      await featureGenerator(tree, {
        ...featureTargets,
        name: 'invoice-reconciliation',
        migrationTimestamp: '20260713000002',
      });

      const runner = tree.read('packages/tooling/src/commands/db/orm-migration-config.ts', 'utf8')!;
      assert.match(
        runner,
        /const\s+\{\s*billingLedgerMigrations,?\s*\}\s*=\s*require\(['"]@app\/backend-postgres-main-billing-ledger['"]\);/u,
      );
      assert.match(runner, /\.\.\.billingLedgerMigrations,[\s\S]*\.\.\.invoiceReconciliationMigrations/u);
      assert.match(runner, /migrationsList:\s*\[\s*\n/u);
      assert.equal((runner.match(/migrationsList:/gu) ?? []).length, 1);
    });

    it('creates frontend files', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      assert.equal(tree.exists('libs/frontend/api-client/lib/src/features/invoices.ts'), false);
      const pagePath = 'apps/frontend/app/src/pages/invoices/ui/InvoicesPage.tsx';
      assert.ok(tree.exists(pagePath));
      const page = tree.read(pagePath, 'utf8')!;
      assert.ok(page.includes('InvoicesPage'));
      assert.equal(page.includes('@app/backend-'), false);
      assert.ok(tree.exists('docs/features/invoices/scaffold.md'));
    });

    it('updates tsconfig.base.json path aliases', async () => {
      const tree = await createTree();
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: { paths: { '@app/existing': ['libs/existing.ts'] } },
        }),
      );

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      const tsconfig = JSON.parse(tree.read('tsconfig.base.json', 'utf8')!);
      const paths = tsconfig.compilerOptions.paths;

      // Existing alias preserved
      assert.ok(paths['@app/existing']);
      // New aliases added
      assert.ok(paths['@app/backend-feature-invoices-main']);
      assert.ok(paths['@app/backend-feature-invoices-shared']);
      assert.ok(paths['@app/backend-postgres-main-invoices']);
    });

    it('generates correct content in shared DTO file', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'Billing Events', skipFormat: true });

      const shared = tree.read('libs/backend/feature/billing-events/shared/lib/src/index.ts', 'utf8')!;
      assert.ok(shared.includes('export interface BillingEventsDto'));
      assert.ok(shared.includes('export interface CreateBillingEventsDto'));
      assert.ok(shared.includes('BillingEventsReadPermission'));
    });

    it('generates correct content in controller file', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      const controller = tree.read('libs/backend/feature/invoices/main/lib/src/invoices.controller.ts', 'utf8')!;
      assert.ok(controller.includes('InvoicesController'));
      assert.ok(controller.includes('@Controller("invoices")'));
      assert.ok(controller.includes('@app/backend-common-swagger'));
      assert.ok(controller.includes('@app/backend-common-response'));
      assert.ok(controller.includes('SessionAuthGuard'));
      assert.ok(controller.includes('RequirePermissions'));
      assert.ok(controller.includes('@Length(1, 255)'));
    });

    it('generates correct content in service file', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      const service = tree.read('libs/backend/feature/invoices/main/lib/src/invoices.service.ts', 'utf8')!;
      assert.ok(service.includes('InvoicesService'));
      assert.ok(service.includes('@Injectable()'));
      assert.ok(service.includes('InvoicesRepository'));
    });

    it('generates correct entity schema', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'support-cases', skipFormat: true });

      const entity = tree.read(
        'libs/backend/postgres/main/support-cases/lib/src/infrastructure/data-access/entities/support-cases.entity.ts',
        'utf8',
      )!;
      assert.ok(entity.includes('SupportCasesEntity'));
      assert.ok(entity.includes('tableName: "support_cases"'));
    });

    it('generates correct project.json files for feature libraries', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true });

      const mainPj = JSON.parse(tree.read('libs/backend/feature/invoices/main/lib/project.json', 'utf8')!);
      assert.equal(mainPj.name, '@app/backend-feature-invoices-main');
      assert.ok(mainPj.tags.includes('type:feature-main'));

      const sharedPj = JSON.parse(tree.read('libs/backend/feature/invoices/shared/lib/project.json', 'utf8')!);
      assert.equal(sharedPj.name, '@app/backend-feature-invoices-shared');
      assert.ok(sharedPj.tags.includes('type:feature-shared'));
    });
  });

  describe('application wiring', () => {
    it('targets the selected frontend root and wires the API module', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));
      tree.write(
        'apps/backend/user/user-app-api/project.json',
        JSON.stringify({ name: 'user-app-api', root: 'apps/backend/user/user-app-api', tags: ['type:backend-app'] }),
      );
      tree.write(
        'apps/backend/user/user-app-api/src/user-app-api.module.ts',
        'import { Module } from "@nestjs/common";\n\n@Module({ imports: [], controllers: [], providers: [] })\nexport class UserAppApiModule {}\n',
      );
      tree.write(
        'apps/frontend/admin/project.json',
        JSON.stringify({
          name: 'admin-app',
          root: 'apps/frontend/admin',
          sourceRoot: 'apps/frontend/admin/src',
          tags: ['type:frontend-app'],
        }),
      );
      tree.write('apps/frontend/admin/vite.config.mts', 'export default {};\n');

      const { featureGenerator } = await import('./generator.js');
      await featureGenerator(tree, {
        name: 'audit-log',
        apiApp: 'user-app-api',
        frontendApp: 'admin-app',
        migrationTimestamp: '20260713010101',
        skipFormat: true,
      });

      assert.ok(tree.exists('apps/frontend/admin/src/pages/audit-log/ui/AuditLogPage.tsx'));
      const module = tree.read('apps/backend/user/user-app-api/src/user-app-api.module.ts', 'utf8')!;
      assert.match(module, /import \{ AuditLogModule \} from "@app\/backend-feature-audit-log-main"/);
      assert.match(module, /imports: \[AuditLogModule,/);
    });
  });

  // -----------------------------------------------------------------------
  // E2E: dry-run
  // -----------------------------------------------------------------------

  describe('dry-run', () => {
    it('dry-run prints CREATE lines without writing files', async () => {
      const tree = await createTree();
      tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));

      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      try {
        const { featureGenerator } = await import('./generator.js');
        await featureGenerator(tree, { ...featureTargets, name: 'invoices', skipFormat: true, dryRun: true });

        // Files should NOT exist
        assert.ok(!tree.exists('libs/backend/feature/invoices/shared/lib/src/index.ts'));
        assert.ok(logs.some((l) => l.includes('CREATE libs/backend/feature/invoices')));
        assert.ok(logs.some((l) => l.includes('UPDATE tsconfig.base.json')));
        assert.ok(logs.some((l) => l.includes('production migration registration')));
        assert.ok(logs.some((l) => l.includes('Next steps')));
      } finally {
        console.log = origLog;
      }
    });
  });
});
