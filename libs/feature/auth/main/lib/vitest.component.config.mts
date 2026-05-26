/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  cacheDir: "../../../../../dist/out-tsc/libs/feature/auth/main-component",
  test: {
    environment: "node",
    include: ["src/**/*.postgres.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory: "../../../../../coverage/libs/feature/auth/main-component",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.{ts,tsx}"],
      exclude: ["src/**/*.spec.ts", "src/**/*.component-spec.ts"],
    },
  },
});
