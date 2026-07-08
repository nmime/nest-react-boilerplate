import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import { workspaceTsconfigAliases } from "../../../config/vite/workspace-tsconfig-aliases.mjs";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vite/apps/frontend/site",
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  server: {
    port: 4203,
    host: "localhost",
  },
  preview: {
    port: 4203,
    host: "localhost",
  },
  plugins: [react(), vike()],
  build: {
    outDir: "../../../dist/apps/frontend/site/client",
    emptyOutDir: true,
    reportCompressedSize: true,
  },
});
