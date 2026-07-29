/**
 * Tests for the application generator.
 *
 * UNIT: name validation, duplicate detection, option defaults
 * COMPONENT: generator + tree integration (skeleton files)
 * E2E: full backend + frontend app generation on in-memory tree
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  return createTreeWithEmptyWorkspace();
}

describe('application generator', () => {
  // -----------------------------------------------------------------------
  // UNIT: validation
  // -----------------------------------------------------------------------

  describe('name validation', () => {
    it('rejects empty name', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');
      await assert.rejects(() => applicationGenerator(tree, { name: '', kind: 'backend' }), /Name must not be empty/);
    });

    it('rejects whitespace-only name', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');
      await assert.rejects(
        () => applicationGenerator(tree, { name: '   ', kind: 'backend' }),
        /Name must not be empty/,
      );
    });

    it('rejects invalid kind', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');
      await assert.rejects(
        // @ts-expect-error testing invalid kind
        () => applicationGenerator(tree, { name: 'my-app', kind: 'mobile' }),
        /Unsupported application kind/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: duplicate detection
  // -----------------------------------------------------------------------

  describe('duplicate detection', () => {
    it('rejects duplicate app name', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      // First generation succeeds
      await applicationGenerator(tree, { name: 'test-app', kind: 'backend', skipFormat: true });

      // Second generation should fail
      await assert.rejects(
        () => applicationGenerator(tree, { name: 'test-app', kind: 'backend', skipFormat: true }),
        /already exists/,
      );
    });

    it('rejects clone-style variants beside an existing application owner', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'customer-portal', kind: 'frontend', skipFormat: true });

      for (const name of [
        'customer-portal-new',
        'customer-portal-v2',
        'customer-portal-copy',
        'copy-of-customer-portal',
      ]) {
        await assert.rejects(
          () => applicationGenerator(tree, { name, kind: 'frontend', skipFormat: true }),
          /Modify the existing owner in place/,
        );
      }
    });

    it('rejects the generic starter application owner and clone variants', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      for (const name of ['app', 'default-app', 'example-app', 'starter-app', 'starter-app-new', 'template-app-v2']) {
        await assert.rejects(
          () => applicationGenerator(tree, { name, kind: 'frontend', skipFormat: true }),
          /not a product owner/,
        );
      }
    });

    it('allows a version-like name when it is genuinely new ownership', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'protocol-v2', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('apps/backend/protocol/protocol-v2/project.json'));
    });
  });

  // -----------------------------------------------------------------------
  // E2E: backend application generation
  // -----------------------------------------------------------------------

  describe('backend application', () => {
    it('creates a health-enabled Nest API and respects the configured port', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, {
        name: 'billing-api',
        kind: 'backend',
        renderer: 'nest-api',
        port: 3210,
        skipFormat: true,
      });

      const main = tree.read('apps/backend/billing/billing-api/src/main.ts', 'utf8')!;
      const module = tree.read('apps/backend/billing/billing-api/src/billing-api.module.ts', 'utf8')!;
      assert.match(main, /process\.env\.PORT \?\? 3210/);
      assert.match(main, /initializeCapabilities\("billing-api"\)/);
      assert.match(main, /import\("\.\/billing-api\.module"\)/);
      assert.match(main, /import\("\.\/bootstrap\.runtime"\)/);
      assert.doesNotMatch(main, /^import .*billing-api\.module/m);
      assert.match(module, /BaseHealthController/);
      assert.match(module, /BillingApiCapabilitiesModule/);
      assert.ok(tree.exists('apps/backend/billing/billing-api/src/capabilities.generated.ts'));
      assert.ok(tree.exists('apps/backend/billing/billing-api/src/capabilities.bootstrap.generated.ts'));
      assert.ok(tree.exists('apps/backend/billing/billing-api/src/bootstrap.runtime.ts'));
      assert.ok(tree.exists('apps/backend/billing/billing-api/src/health.config.ts'));
      const agentPolicy = tree.read('apps/backend/billing/billing-api/AGENTS.md', 'utf8')!;
      assert.match(agentPolicy, /libs\/backend/);
      assert.doesNotMatch(agentPolicy, /- Runtime:/);
      const readme = tree.read('apps/backend/billing/billing-api/README.md', 'utf8')!;
      assert.match(readme, /billing-api:build/);
      assert.match(readme, /setup catalog/);
      assert.match(readme, /onboarding:verify/);
      assert.doesNotMatch(readme, /Generated .* at `apps\//);
      assert.doesNotMatch(readme, /^Nx tags:/m);
    });

    it('creates an application-context consumer without HTTP bootstrap', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, {
        name: 'billing-consumer',
        kind: 'backend',
        renderer: 'consumer',
        skipFormat: true,
      });

      const main = tree.read('apps/backend/billing/billing-consumer/src/main.ts', 'utf8')!;
      assert.match(main, /createApplicationContext/);
      assert.match(main, /enableShutdownHooks/);
      assert.match(main, /initializeCapabilities\("billing-consumer"\)/);
      assert.match(main, /import\("\.\/billing-consumer\.module"\)/);
      assert.match(main, /import\("\.\/bootstrap\.runtime"\)/);
      assert.doesNotMatch(main, /^import .*billing-consumer\.module/m);
      assert.equal(main.includes('bootstrapNestApi'), false);
      assert.match(main, /Application context successfully started/);
      assert.equal(tree.exists('apps/backend/billing/billing-consumer/package.json'), false);
    });

    it('creates a scheduler with process-level ScheduleModule ownership', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, {
        name: 'billing-scheduler',
        kind: 'backend',
        renderer: 'scheduler',
        skipFormat: true,
      });

      const module = tree.read('apps/backend/billing/billing-scheduler/src/billing-scheduler.module.ts', 'utf8')!;
      assert.match(module, /ScheduleModule\.forRoot\(\)/);
      assert.match(module, /BillingSchedulerCapabilitiesModule/);
    });

    it('rejects an HTTP port for consumer and scheduler processes', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      for (const renderer of ['consumer', 'scheduler'] as const) {
        await assert.rejects(
          () =>
            applicationGenerator(tree, {
              name: `billing-${renderer}`,
              kind: 'backend',
              renderer,
              port: 3110,
              skipFormat: true,
            }),
          /do not expose an HTTP port/,
        );
      }
    });

    it('rejects the removed generic worker renderer', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await assert.rejects(
        () =>
          applicationGenerator(tree, {
            name: 'billing-worker',
            kind: 'backend',
            renderer: 'worker' as never,
            skipFormat: true,
          }),
        /Unsupported backend renderer/,
      );
    });
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      const projectJson = JSON.parse(tree.read('apps/backend/my/my-api/project.json', 'utf8')!);
      assert.equal(projectJson.name, 'my-api');
      assert.equal(projectJson.projectType, 'application');
      assert.ok(projectJson.tags.includes('platform:backend'));
      assert.ok(projectJson.tags.includes('type:backend-app'));
      assert.ok(projectJson.targets.build);
      assert.equal(projectJson.targets.build.executor, '@nx/js:tsc');
    });

    it('keeps application identity in project.json without creating a package boundary', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      assert.equal(tree.exists('apps/backend/my/my-api/package.json'), false);
      const project = JSON.parse(tree.read('apps/backend/my/my-api/project.json', 'utf8')!);
      assert.equal(project.name, 'my-api');
    });

    it('creates tsconfig files', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('apps/backend/my/my-api/tsconfig.json'));
      assert.ok(tree.exists('apps/backend/my/my-api/tsconfig.app.json'));
      assert.ok(tree.exists('apps/backend/my/my-api/tsconfig.spec.json'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('apps/backend/my/my-api/src/main.ts'));
      assert.ok(tree.exists('apps/backend/my/my-api/src/my-api.module.ts'));
      assert.ok(tree.exists('apps/backend/my/my-api/src/my-api.module.spec.ts'));
      assert.ok(tree.exists('apps/backend/my/my-api/src/bootstrap.runtime.ts'));

      const mainContent = tree.read('apps/backend/my/my-api/src/main.ts', 'utf8')!;
      assert.ok(mainContent.includes('MyApiModule'));
      assert.ok(mainContent.includes('void bootstrap()'), 'main.ts must explicitly launch the async bootstrap');
      assert.ok(
        mainContent.includes('./bootstrap.runtime'),
        'main.ts must dynamically import the local Nest bootstrap bridge',
      );
      assert.ok(mainContent.includes('await bootstrapModule.bootstrapNestApi'));
    });

    it('main.ts has no unhandled-floating-promise lint errors', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      const mainContent = tree.read('apps/backend/my/my-api/src/main.ts', 'utf8')!;
      assert.ok(/\bvoid\s+bootstrap\(\)/.test(mainContent), "async bootstrap call must be void'd");
      assert.ok(/await\s+bootstrapModule\.bootstrapNestApi/.test(mainContent), 'Nest bootstrap must be awaited');
    });

    it('spec file imports vitest explicitly', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      const specContent = tree.read('apps/backend/my/my-api/src/my-api.module.spec.ts', 'utf8')!;
      assert.ok(specContent.includes('from "vitest"'), 'spec must import from vitest, not use globals');
      assert.ok(specContent.includes('describe'), 'must import describe');
      assert.ok(specContent.includes('it'), 'must import it');
      assert.ok(specContent.includes('expect'), 'must import expect');
    });

    it('eslint config has proper ignores and parserOptions', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      const eslintContent = tree.read('apps/backend/my/my-api/eslint.config.cjs', 'utf8')!;
      assert.ok(eslintContent.includes('ignores:'), 'eslint must have ignores array');
      assert.ok(eslintContent.includes('tsconfig.*?.json'), 'eslint must have tsconfig.*?.json project');
    });

    it('creates vitest config', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-api', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('apps/backend/my/my-api/vitest.config.mts'));
      const config = tree.read('apps/backend/my/my-api/vitest.config.mts', 'utf8')!;
      assert.ok(config.includes('"coverage/apps/backend/my/my-api"'));
      assert.equal(config.includes('../coverage/'), false);
    });

    it('rejects custom directories outside canonical ownership', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await assert.rejects(
        () =>
          applicationGenerator(tree, {
            name: 'my-api',
            kind: 'backend',
            directory: 'apps/custom/my-api',
            skipFormat: true,
          }),
        /Custom application directories are disabled/,
      );
    });

    it('rejects custom tags that bypass ownership boundaries', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await assert.rejects(
        () =>
          applicationGenerator(tree, {
            name: 'my-api',
            kind: 'backend',
            tags: 'custom:tag,another:tag',
            skipFormat: true,
          }),
        /Custom application tags are disabled/,
      );
    });

    it('generates multi-word app names correctly', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'Support Ticket API', kind: 'backend', skipFormat: true });

      assert.ok(tree.exists('apps/backend/support/support-ticket-api/project.json'));
      const projectJson = JSON.parse(tree.read('apps/backend/support/support-ticket-api/project.json', 'utf8')!);
      assert.equal(projectJson.name, 'support-ticket-api');
    });
  });

  // -----------------------------------------------------------------------
  // E2E: frontend application generation
  // -----------------------------------------------------------------------

  describe('frontend application', () => {
    it('creates renderer-specific Astro, Vike, and Expo applications', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'docs', kind: 'frontend', renderer: 'astro', skipFormat: true });
      await applicationGenerator(tree, { name: 'store', kind: 'frontend', renderer: 'vike', skipFormat: true });
      await applicationGenerator(tree, { name: 'native', kind: 'frontend', renderer: 'expo', skipFormat: true });

      assert.ok(tree.exists('apps/frontend/docs/src/pages/index.astro'));
      const docsPackage = JSON.parse(tree.read('apps/frontend/docs/package.json', 'utf8')!);
      assert.equal(docsPackage.name, undefined);
      assert.equal(docsPackage.scripts, undefined);
      assert.equal(docsPackage.devDependencies.astro, '7.1.3');
      assert.ok(tree.exists('apps/frontend/store/pages/index/+Page.tsx'));
      assert.ok(tree.exists('apps/frontend/store/store.vite.config.mts'));
      assert.equal(tree.exists('apps/frontend/store/vite.config.mts'), false);
      assert.ok(tree.exists('apps/frontend/native/app/_layout.tsx'));
      assert.equal(tree.read('apps/frontend/native/index.js', 'utf8'), 'require("expo-router/entry");\n');
      assert.ok(tree.exists('apps/frontend/native/babel.config.js'));
      assert.match(tree.read('apps/frontend/native/metro.config.js', 'utf8')!, /workspace-tsconfig-aliases/);
      const nativePackage = JSON.parse(tree.read('apps/frontend/native/package.json', 'utf8')!);
      assert.equal(nativePackage.name, undefined);
      assert.equal(nativePackage.main, undefined);
      assert.equal(nativePackage.scripts, undefined);
      assert.equal(nativePackage.dependencies['expo-router'], '57.0.7');
      assert.doesNotMatch(tree.read('apps/frontend/native/AGENTS.md', 'utf8')!, /- Runtime:/);
    });

    it('rejects a renderer from the wrong platform', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');
      await assert.rejects(
        () => applicationGenerator(tree, { name: 'bad', kind: 'frontend', renderer: 'nest-api' }),
        /Unsupported frontend renderer/,
      );
    });
    it('creates project.json with correct structure', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      const projectJson = JSON.parse(tree.read('apps/frontend/my-dashboard/project.json', 'utf8')!);
      assert.equal(projectJson.name, 'my-dashboard');
      assert.equal(projectJson.projectType, 'application');
      assert.ok(projectJson.tags.includes('platform:frontend'));
      assert.ok(projectJson.tags.includes('type:frontend-app'));
      assert.ok(projectJson.tags.includes('fsd:layer:app'));
    });

    it('keeps application identity in project.json without creating a package boundary', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      assert.equal(tree.exists('apps/frontend/my-dashboard/package.json'), false);
      const project = JSON.parse(tree.read('apps/frontend/my-dashboard/project.json', 'utf8')!);
      assert.equal(project.name, 'my-dashboard');
    });

    it('creates index.html', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      assert.ok(tree.exists('apps/frontend/my-dashboard/index.html'));
      const html = tree.read('apps/frontend/my-dashboard/index.html', 'utf8')!;
      assert.ok(html.includes('My Dashboard'));
    });

    it('creates source files', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      assert.ok(tree.exists('apps/frontend/my-dashboard/src/main.tsx'));
      assert.ok(tree.exists('apps/frontend/my-dashboard/src/app.tsx'));
      assert.ok(tree.exists('apps/frontend/my-dashboard/src/app.spec.tsx'));
    });

    it('creates vite config', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      assert.ok(tree.exists('apps/frontend/my-dashboard/vite.config.mts'));
      assert.ok(tree.exists('apps/frontend/my-dashboard/vitest.config.mts'));

      const viteConfig = tree.read('apps/frontend/my-dashboard/vite.config.mts', 'utf8')!;
      assert.ok(viteConfig.includes('root: import.meta.dirname'), "vite root must be import.meta.dirname, not '.'");
      assert.match(viteConfig, /port: 4200/);
      assert.match(viteConfig, /vite-plugin-istanbul/);

      const project = JSON.parse(tree.read('apps/frontend/my-dashboard/project.json', 'utf8')!);
      assert.equal(project.targets.build, undefined);
      assert.equal(project.targets.serve, undefined);
      assert.ok(project.targets.typecheck);
      assert.ok(project.targets.e2e);

      const main = tree.read('apps/frontend/my-dashboard/src/main.tsx', 'utf8')!;
      assert.match(main, /UiErrorBoundary/);
    });

    it('uses the configured Vite development and preview port', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, {
        name: 'portal',
        kind: 'frontend',
        renderer: 'vite',
        port: 4317,
        skipFormat: true,
      });

      const viteConfig = tree.read('apps/frontend/portal/vite.config.mts', 'utf8')!;
      assert.match(viteConfig, /port: 4317/);
    });

    it('selects the first free canonical port and rejects explicit collisions', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, {
        name: 'customer-portal',
        kind: 'frontend',
        renderer: 'vite',
        port: 4200,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'staff-portal',
        kind: 'frontend',
        renderer: 'vite',
        skipFormat: true,
      });

      const config = tree.read('apps/frontend/staff-portal/vite.config.mts', 'utf8')!;
      assert.match(config, /server: \{ host: "localhost", port: 4201 \}/);
      await assert.rejects(
        () =>
          applicationGenerator(tree, {
            name: 'partner-portal',
            kind: 'frontend',
            renderer: 'vite',
            port: 4200,
            skipFormat: true,
          }),
        /port 4200 is already used/,
      );
    });

    it('creates tsconfig files', async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import('./generator.js');

      await applicationGenerator(tree, { name: 'my-dashboard', kind: 'frontend', skipFormat: true });

      assert.ok(tree.exists('apps/frontend/my-dashboard/tsconfig.json'));
      assert.ok(tree.exists('apps/frontend/my-dashboard/tsconfig.app.json'));
      assert.ok(tree.exists('apps/frontend/my-dashboard/tsconfig.spec.json'));

      const tsconfig = JSON.parse(tree.read('apps/frontend/my-dashboard/tsconfig.json', 'utf8')!);
      assert.equal(tsconfig.compilerOptions.jsx, 'react-jsx');
    });
  });
});
