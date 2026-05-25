/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/feature/auth/oauth",
  test: {
    environment: "node",
    include: ["lib/src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/feature/auth/oauth",
      ["lib/src/lib/**/*.ts"],
      ["lib/src/**/*.types.ts", "lib/src/**/*.module.ts"],
    ),
  },
});
