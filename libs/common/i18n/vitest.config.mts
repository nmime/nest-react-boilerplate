import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../dist/out-tsc/libs/common/i18n",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["lib/lib/src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/libs/common/i18n",
      ["lib/lib/src/**/*.ts"],
      [],
    ),
  },
});
