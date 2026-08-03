export default {
  packageManager: "pnpm",
  testRunner: "command",
  commandRunner: {
    // `tooling qa mutation --project <p>` sets STRYKER_TEST_COMMAND to that
    // project's own test target. The workspace-wide fallback only applies to an
    // explicit `--all` run, because the command runner re-executes it once per
    // mutant with no coverage analysis to narrow the set.
    command:
      process.env.STRYKER_TEST_COMMAND ??
      "pnpm exec nx run-many -t test --skip-nx-cache",
  },
  mutate: [
    "apps/**/*.ts",
    "apps/**/*.tsx",
    "libs/**/*.ts",
    "libs/**/*.tsx",
    "!**/*.spec.ts",
    "!**/*.spec.tsx",
    "!**/*.e2e-spec.ts",
    "!**/*.component-spec.ts",
    "!**/generated/**",
    "!**/migrations/**",
  ],
  thresholds: { high: 80, low: 60, break: 50 },
  timeoutMS: 60000,
  concurrency: 2,
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: { fileName: "test-results/mutation/index.html" },
  coverageAnalysis: "off",
};
