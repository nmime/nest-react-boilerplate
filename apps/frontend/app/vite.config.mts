/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import istanbul from "vite-plugin-istanbul";

export default defineConfig(({ command, mode }) => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === "true";
  assertRequiredFrontendApiBaseUrls(command, mode);

  return {
    root: import.meta.dirname,
    cacheDir: "../../../node_modules/.vite/apps/frontend/app",
    server: {
      port: 4201,
      host: "localhost",
    },
    preview: {
      port: 4201,
      host: "localhost",
    },
    plugins: [
      tailwindcss(),
      react(),
      tsconfigPaths(),
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
      outDir: "../../../dist/apps/frontend/app",
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: isE2eCoverage,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});

const frontendApiBaseUrlKeys = [
  "VITE_AUTH_API_BASE_URL",
  "VITE_USER_API_BASE_URL",
  "VITE_ADMIN_API_BASE_URL",
] as const;

const sameOriginApiMode = "same-origin";

const getEnvString = (key: string): string => {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
};

const assertRequiredFrontendApiBaseUrls = (
  command: string,
  mode: string,
): void => {
  const isNonProduction =
    command !== "build" || mode === "development" || mode === "test";
  const isSameOrigin =
    getEnvString("VITE_API_BASE_URL_MODE").toLowerCase() === sameOriginApiMode;

  if (isNonProduction || isSameOrigin) {
    return;
  }

  const missing = frontendApiBaseUrlKeys.filter((key) => !getEnvString(key));
  if (missing.length > 0) {
    throw new Error(
      `Missing required production frontend API base URL env var(s): ${missing.join(", ")}. ` +
        `Set explicit API origins or set VITE_API_BASE_URL_MODE=${sameOriginApiMode} to opt into a same-origin API proxy.`,
    );
  }
};
