import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import vike from "vike/plugin";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vite/apps/frontend/site",
  server: {
    port: 4203,
    host: "localhost",
  },
  preview: {
    port: 4203,
    host: "localhost",
  },
  plugins: [react(), nxViteTsPaths(), vike()],
  build: {
    outDir: "../../../dist/apps/frontend/site/client",
    emptyOutDir: true,
    reportCompressedSize: true,
  },
});
