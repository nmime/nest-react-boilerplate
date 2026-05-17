/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../libs/common/i18n/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../dist/out-tsc/libs/common/bootstrap",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/libs/common/bootstrap",
      ["src/**/*.ts"],
      [],
    ),
  },
});
