/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../config/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/exception": new URL(
        "../../../../libs/common/exception/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/i18n": new URL(
        "../../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../../dist/out-tsc/libs/common/swagger",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/common/swagger",
      ["src/**/*.ts"],
      [],
    ),
  },
});
