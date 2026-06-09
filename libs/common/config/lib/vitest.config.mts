import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.spec.ts"],
    coverage: {
      reportsDirectory: "../../../../coverage/libs/common/config",
    },
  },
});
