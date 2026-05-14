/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/features/auth/oauth",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
  },
});
