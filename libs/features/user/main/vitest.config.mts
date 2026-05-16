/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/features/user/main",
  resolve: {
    alias: {
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../../libs/common/response/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-auth-oauth": new URL(
        "../../../../libs/features/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-user-shared": new URL(
        "../../../../libs/features/user/shared/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/features/user/main",
      ["src/**/*.ts"],
      ["src/index.ts", "src/lib/user-main.module.ts"],
    ),
  },
});
