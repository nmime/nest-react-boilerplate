import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const previewApplications = new Set(["admin-app-api", "auth-app-api", "user-app-api"]);

export function isOpenApiPreviewApplication(value: string): boolean {
  return previewApplications.has(value);
}

export function runOpenApiPreview(app: string, output: string): void {
  if (!isOpenApiPreviewApplication(app)) {
    throw new Error(`OpenAPI preview is not configured for ${app}.`);
  }
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      "@swc-node/register",
      "--require",
      "tsconfig-paths/register",
      resolve(process.cwd(), "packages/tooling/src/commands/api/openapi-preview-runtime.ts"),
      "--app",
      app,
      "--output",
      output,
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`OpenAPI preview failed for ${app}.`);
  }
}
