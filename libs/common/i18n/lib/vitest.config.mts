import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
// nx-ignore-next-line
import { fullCoverage } from "../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../../dist/out-tsc/libs/common/i18n",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/common/i18n",
      ["src/**/*.ts"],
      [],
    ),
  },
});
