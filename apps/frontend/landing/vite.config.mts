/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import istanbul from "vite-plugin-istanbul";
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
} from "../../../libs/frontend/api-support/lib/src/lib/frontend-env";

export default defineConfig(({ command, mode }) => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === "true";
  applyDefaultFrontendBuildApiBaseUrlMode(process.env, command, mode);
  assertRequiredFrontendBuildApiBaseUrls(process.env, command, mode);

  return {
    root: import.meta.dirname,
    cacheDir: "../../../node_modules/.vite/apps/frontend/landing",
    server: {
      port: 4202,
      host: "localhost",
    },
    preview: {
      port: 4202,
      host: "localhost",
    },
    plugins: [
      tailwindcss(),
      react(),
      nxViteTsPaths(),
      nxCopyAssetsPlugin(["*.md"]),
      ...(isE2eCoverage
        ? [
            istanbul({
              cwd: import.meta.dirname,
              include: "src/**/*.{ts,tsx}",
              exclude: ["src/**/*.spec.*", "src/**/*.test.*"],
              extension: [".ts", ".tsx"],
              requireEnv: false,
              forceBuildInstrument: true,
              // Vite 8/Rolldown validates pure annotations after Istanbul wraps JSX
              // branch counters. Dropping generated comments keeps the browser
              // coverage build instrumented without emitting invalid annotations.
              generatorOpts: {
                comments: false,
              },
            }),
          ]
        : []),
    ],
    build: {
      outDir: "../../../dist/apps/frontend/landing",
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: isE2eCoverage,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
