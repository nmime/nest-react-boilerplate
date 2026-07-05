/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      "@app/backend-common-component-test": new URL(
        "../../../../libs/backend/common/component-test/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir:
    "../../../../dist/out-tsc/libs/backend/feature/auth/test/lib-component",
  test: {
    environment: "node",
    include: ["src/**/*.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory:
        "../../../../coverage/libs/backend/feature/auth/test/lib-component",
      reporter: ["text", "lcov"],
      exclude: ["src/**/*.component-spec.ts"],
    },
  },
});
