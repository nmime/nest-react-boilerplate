/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/feature/admin/shared",
  resolve: {
    alias: {
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["lib/src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/feature/admin/shared",
      ["lib/src/**/*.ts"],
      [],
    ),
  },
});
