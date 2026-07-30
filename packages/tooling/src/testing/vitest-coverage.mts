import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestUserConfig as VitestUserConfig } from 'vitest/config';

type CoverageThresholds = {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
};

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const workspaceCoverageRoot = resolve(workspaceRoot, 'coverage');

export function workspaceCoverageDirectory(reportsDirectory: string): string {
  const normalizedDirectory = reportsDirectory.replaceAll('\\', '/');

  if (isAbsolute(reportsDirectory) || !normalizedDirectory.startsWith('coverage/')) {
    throw new Error(
      `Coverage reports directory must be workspace-relative and start with "coverage/": ${reportsDirectory}`,
    );
  }

  const absoluteDirectory = resolve(workspaceRoot, normalizedDirectory);
  if (!absoluteDirectory.startsWith(`${workspaceCoverageRoot}${sep}`)) {
    throw new Error(`Coverage reports directory escapes the workspace coverage root: ${reportsDirectory}`);
  }

  return absoluteDirectory;
}

/**
 * Creates the shared coverage contract. Positive thresholds are percentages;
 * negative thresholds are maximum uncovered-item budgets, which lets an
 * existing project ratchet coverage without pretending historical debt is
 * already covered.
 */
export const fullCoverage = (
  reportsDirectory: string,
  include: string[],
  exclude: string[] = [],
  thresholds: Partial<CoverageThresholds> = {},
): NonNullable<VitestUserConfig['coverage']> => ({
  enabled: false,
  exclude: [
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.e2e-spec.ts',
    '**/*.component-spec.ts',
    '**/*.stories.ts',
    '**/*.stories.tsx',
    '**/*.d.ts',
    '**/vite.config.*',
    '**/*.vite.config.*',
    '**/vitest.config.*',
    '**/playwright.config.*',
    '**/playwright.*.config.*',
    '**/eslint.config.*',
    '**/astro.config.*',
    '**/tailwind.config.*',
    '**/postcss.config.*',
    '**/main.ts',
    '**/main.tsx',
    // Setup-generated/source-derived bootstrap shims contain no product logic.
    '**/capabilities.bootstrap.generated.ts',
    '**/bootstrap.runtime.ts',
    '**/generated/**',
    '**/migrations/**',
    '**/node_modules/**',
    ...exclude,
  ],
  include,
  provider: 'v8',
  reportsDirectory: workspaceCoverageDirectory(reportsDirectory),
  reporter: ['text', 'lcov'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
    ...thresholds,
  },
});
