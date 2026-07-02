import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
// nx-ignore-next-line
import { fullCoverage } from "../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [nxViteTsPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    coverage: fullCoverage(
      "../../../../coverage/libs/frontend/api-client",
      ["src/lib/**/*.ts"],
      ["src/lib/admin.ts", "src/lib/auth.ts", "src/lib/user.ts"],
    ),
  },
});
