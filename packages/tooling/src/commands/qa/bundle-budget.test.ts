// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { RunResult } from '../../runtime/process';
import { runBundleBudget } from './bundle-budget';

// The performance gate measured only TTFB and the HTML document, so a
// single-chunk multi-megabyte SPA bundle passed it. These cases pin the
// behaviour that replaced it.
const workspaces: string[] = [];

afterEach(() => {
  for (const path of workspaces.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

interface AppFixture {
  project: string;
  root: string;
  /** Built asset basename -> byte length. */
  assets?: Record<string, number>;
  /** Set false to model a project whose build target emits nothing (e.g. tsc --noEmit). */
  declaresBuildOutputs?: boolean;
}

function workspace(apps: AppFixture[], budgets: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'nrb-bundle-budget-'));
  workspaces.push(root);

  mkdirSync(join(root, 'packages/tooling/config'), { recursive: true });
  writeFileSync(join(root, 'packages/tooling/config/frontend-bundle-budgets.json'), JSON.stringify(budgets));

  for (const app of apps) {
    if (!app.assets) {
      continue;
    }
    const outputPath = join(root, 'dist', app.root);
    mkdirSync(outputPath, { recursive: true });
    for (const [name, bytes] of Object.entries(app.assets)) {
      writeFileSync(join(outputPath, name), 'x'.repeat(bytes));
    }
  }

  return root;
}

function runtimeFor(apps: AppFixture[]) {
  return {
    run: (_program: string, args: string[]): RunResult => {
      const ok = (stdout: string): RunResult => ({ command: 'nx', status: 0, stdout, stderr: '' });
      if (args.includes('projects')) {
        return ok(JSON.stringify(apps.map((app) => app.project)));
      }
      const name = args[args.indexOf('project') + 1];
      const app = apps.find((entry) => entry.project === name);
      return ok(
        JSON.stringify({
          root: app?.root ?? 'unknown',
          targets: {
            build: {
              outputs: app?.declaresBuildOutputs === false ? [] : [`{workspaceRoot}/dist/${app?.root ?? 'unknown'}`],
            },
          },
        }),
      );
    },
  };
}

const budgets = (overrides: Record<string, unknown> = {}) => ({
  default: { maxChunkBytes: 400, maxCssBytes: 200, maxJavaScriptBytes: 1000 },
  projects: overrides,
});

describe('runBundleBudget', () => {
  it('passes when every measured app is inside its budget', () => {
    const apps: AppFixture[] = [
      { assets: { 'entry.js': 300, 'styles.css': 100, 'vendor.js': 200 }, project: 'web-app', root: 'apps/web' },
    ];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 0);
  });

  it('fails an un-split entry chunk even when the total is inside budget', () => {
    // The whole point of the gate: 900B total is fine, one 900B chunk is not.
    const apps: AppFixture[] = [{ assets: { 'entry.js': 900 }, project: 'web-app', root: 'apps/web' }];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('fails on total JavaScript over budget across many small chunks', () => {
    const apps: AppFixture[] = [
      {
        assets: { 'a.js': 350, 'b.js': 350, 'c.js': 350 },
        project: 'web-app',
        root: 'apps/web',
      },
    ];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('fails on CSS over budget', () => {
    const apps: AppFixture[] = [
      { assets: { 'entry.js': 100, 'styles.css': 300 }, project: 'web-app', root: 'apps/web' },
    ];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('honours a per-project budget override', () => {
    const apps: AppFixture[] = [{ assets: { 'entry.js': 900 }, project: 'web-app', root: 'apps/web' }];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets({ 'web-app': { maxChunkBytes: 1000 } })),
    });

    assert.equal(status, 0);
  });

  it('treats a missing build as a failure rather than a pass', () => {
    const apps: AppFixture[] = [{ project: 'web-app', root: 'apps/web' }];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('skips an unbuilt app under --skip-missing but still measures the built ones', () => {
    const apps: AppFixture[] = [
      { project: 'unbuilt-app', root: 'apps/unbuilt' },
      { assets: { 'entry.js': 300 }, project: 'web-app', root: 'apps/web' },
    ];
    const status = runBundleBudget({
      argv: ['--skip-missing'],
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 0);
  });

  it('passes under --skip-missing when an affected-only run rebuilt no frontend at all', () => {
    // A backend-only PR builds no frontend app, so there is legitimately nothing
    // to weigh. Failing here would have turned the gate into a blanket PR block.
    const apps: AppFixture[] = [{ project: 'unbuilt-app', root: 'apps/unbuilt' }];
    const status = runBundleBudget({
      argv: ['--skip-missing'],
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 0);
  });

  it('still fails without --skip-missing when nothing was built', () => {
    const apps: AppFixture[] = [{ project: 'unbuilt-app', root: 'apps/unbuilt' }];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('does not demand output from a project whose build target declares none', () => {
    // mobile-app is tagged type:frontend-app but builds with `tsc --noEmit`; the
    // Expo web bundle comes from a separate `export` target. Guessing
    // dist/<root> made the gate fail on a directory no build ever writes.
    const apps: AppFixture[] = [
      { declaresBuildOutputs: false, project: 'noemit-app', root: 'apps/noemit' },
      { assets: { 'entry.js': 300 }, project: 'web-app', root: 'apps/web' },
    ];
    const status = runBundleBudget({
      runtime: runtimeFor(apps),
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 0);
  });

  it('fails when Nx returns an unreadable project list', () => {
    const apps: AppFixture[] = [{ assets: { 'entry.js': 100 }, project: 'web-app', root: 'apps/web' }];
    const status = runBundleBudget({
      runtime: {
        run: (): RunResult => ({ command: 'nx', status: 0, stdout: 'not json', stderr: '' }),
      },
      workspaceRoot: workspace(apps, budgets()),
    });

    assert.equal(status, 1);
  });

  it('measures nested build output, not just the output root', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-bundle-budget-nested-'));
    workspaces.push(root);
    mkdirSync(join(root, 'packages/tooling/config'), { recursive: true });
    writeFileSync(
      join(root, 'packages/tooling/config/frontend-bundle-budgets.json'),
      JSON.stringify(budgets()),
    );
    mkdirSync(join(root, 'dist/apps/web/client/assets/chunks'), { recursive: true });
    writeFileSync(join(root, 'dist/apps/web/client/assets/chunks/deep.js'), 'x'.repeat(900));

    const apps: AppFixture[] = [{ project: 'web-app', root: 'apps/web' }];
    const status = runBundleBudget({ runtime: runtimeFor(apps), workspaceRoot: root });

    assert.equal(status, 1);
  });
});
