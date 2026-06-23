/// <reference types="vitest" />
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  cacheDir:
    "../../../../../../dist/out-tsc/libs/backend/feature/auth/main-component",
  test: {
    environment: "node",
    include: ["src/**/*.postgres.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory:
        "../../../../../../coverage/libs/backend/feature/auth/main-component",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.{ts,tsx}"],
      exclude: ["src/**/*.spec.ts", "src/**/*.component-spec.ts"],
    },
  },
});
