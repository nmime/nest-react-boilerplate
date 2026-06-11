import type { InlineConfig } from "vitest";

export const fullCoverage = (
  reportsDirectory: string,
  include: string[],
  exclude: string[] = [],
): NonNullable<InlineConfig["coverage"]> => ({
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
    "**/*.config.*",
    "**/vite.config.*",
    "**/vitest.config.*",
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
  thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
});
