/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../../../dist/out-tsc/libs/postgres/main/auth",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.component-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../coverage/libs/postgres/main/auth",
      ["src/**/*.ts"],
      [],
    ),
  },
});
