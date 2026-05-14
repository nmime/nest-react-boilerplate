/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../../dist/out-tsc/libs/common/response",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
  },
});
