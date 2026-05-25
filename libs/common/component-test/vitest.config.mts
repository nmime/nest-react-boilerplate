/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../dist/out-tsc/libs/common/component-test",
  test: {
    environment: "node",
    include: ["lib/src/**/*.spec.ts"],
    exclude: ["lib/src/**/*.component-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/libs/common/component-test",
      ["lib/src/**/*.ts"],
      ["lib/src/index.ts", "lib/src/**/index.ts"],
    ),
  },
});
