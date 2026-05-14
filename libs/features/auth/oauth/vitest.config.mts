/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/features/auth/oauth",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/features/auth/oauth",
      ["src/lib/**/*.ts"],
      ["src/**/*.types.ts", "src/**/*.module.ts"],
    ),
  },
});
