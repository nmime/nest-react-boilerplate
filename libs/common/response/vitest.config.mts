/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/exception": new URL(
        "../../../libs/common/exception/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../dist/out-tsc/libs/common/response",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/libs/common/response",
      ["src/**/*.ts"],
      [],
    ),
  },
});
