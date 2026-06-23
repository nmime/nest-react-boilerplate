/// <reference types="vitest" />
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir:
    "../../../../../../node_modules/.vitest/out-tsc/libs/backend/feature/admin/shared",
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../../coverage/libs/backend/feature/admin/shared",
      ["src/**/*.ts"],
      [],
    ),
  },
});
