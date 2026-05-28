/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../packages/tooling/scripts/src/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../../dist/out-tsc/libs/common/exception",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/common/exception",
      ["src/**/*.ts"],
      [],
    ),
  },
});
