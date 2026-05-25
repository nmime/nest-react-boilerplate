/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../dist/out-tsc/libs/common/swagger",
  test: {
    environment: "node",
    include: ["lib/lib/src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/libs/common/swagger",
      ["lib/lib/src/**/*.ts"],
      [],
    ),
  },
});
