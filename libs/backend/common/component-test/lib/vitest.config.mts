/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  cacheDir:
    "../../../../node_modules/.vitest/libs/backend/common/component-test/lib",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.component-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/backend/common/component-test/lib",
      ["src/**/*.ts"],
      ["src/index.ts", "src/**/index.ts"],
    ),
  },
});
