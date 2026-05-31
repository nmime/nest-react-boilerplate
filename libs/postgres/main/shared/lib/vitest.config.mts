/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../config/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../../../dist/out-tsc/libs/postgres/main/shared",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../coverage/libs/postgres/main/shared",
      ["src/**/*.ts"],
      [],
    ),
  },
});
