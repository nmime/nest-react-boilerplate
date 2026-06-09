/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      "@app/common-component-test": new URL(
        "../../../../../../libs/common/component-test/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir:
    "../../../../../../dist/out-tsc/libs/backend/postgres/main/auth-component",
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
        "../../../../../../coverage/libs/backend/postgres/main/auth-component",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/entity/auth-user.entity.ts",
        "src/lib/entity/admin-audit-log.entity.ts",
        "src/lib/entity/transactional-outbox-event.entity.ts",
        "src/lib/repository/auth-user.repository.ts",
        "src/lib/repository/admin-user-mutation.repository.ts",
      ],
      exclude: ["src/**/*.component-spec.ts"],
    },
  },
});
