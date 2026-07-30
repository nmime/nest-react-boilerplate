#!/usr/bin/env node
import { openApiContractByName } from "./contracts-manifest.ts";
import { isOpenApiPreviewApplication, runOpenApiPreview } from "./openapi-preview.ts";

function parseArgs(argv: string[]) {
  const authContract = openApiContractByName("auth-app-api");
  const args = {
    app: authContract.app,
    output: authContract.artifactPath,
    port: "3999",
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--app") args.app = val();
    else if (item === "--output") args.output = val();
    else if (item === "--port") args.port = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: repo-tooling api openapi [--app auth-app-api] [--output apps/backend/auth/auth-app-api/contracts/openapi/auth-app-api.json] [--dry-run]",
    );
    return;
  }
  if (args.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", app: args.app, mode: "preview", output: args.output }, null, 2));
    return;
  }
  if (!isOpenApiPreviewApplication(args.app)) {
    throw new Error(`OpenAPI preview is not configured for ${args.app}.`);
  }
  runOpenApiPreview(args.app, args.output);
  console.log(JSON.stringify({ status: "exported", app: args.app, mode: "preview", output: args.output }));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
