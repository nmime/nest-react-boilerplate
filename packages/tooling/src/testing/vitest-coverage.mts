import type { UserConfig } from "vitest/node";

type CoverageThresholds = {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
};

export const fullCoverage = (
  reportsDirectory: string,
  include: string[],
  exclude: string[] = [],
  thresholds: Partial<CoverageThresholds> = {},
): NonNullable<UserConfig["coverage"]> => ({
  all: true,
  enabled: false,
  exclude: [
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.e2e-spec.ts",
    "**/*.component-spec.ts",
    "**/*.stories.ts",
    "**/*.stories.tsx",
    "**/*.d.ts",
    // Tool configuration files only. A broad "**/*.config.*" pattern would
    // also swallow source modules like *.config.service.ts / *.config.ts.
    "**/vite.config.*",
    "**/*.vite.config.*",
    "**/vitest.config.*",
    "**/playwright.config.*",
    "**/playwright.*.config.*",
    "**/eslint.config.*",
    "**/astro.config.*",
    "**/tailwind.config.*",
    "**/postcss.config.*",
    "**/main.ts",
    "**/main.tsx",
    "**/generated/**",
    "**/migrations/**",
    "**/node_modules/**",
    ...exclude,
  ],
  include,
  provider: "v8",
  reportsDirectory,
  reporter: ["text", "lcov"],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
    ...thresholds,
  },
});
