import { resolve } from "node:path";
import {
  checkEndpointManifest,
  formatEndpointManifestIssues,
  writeEndpointManifest,
} from "./endpoint-manifest.ts";

export interface GenerateEndpointManifestOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export function runGenerateEndpointManifest(
  options: GenerateEndpointManifestOptions = {},
): number {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const check = (options.argv ?? []).includes("--check");
  if (check) {
    const issues = checkEndpointManifest(workspaceRoot);
    if (issues.length > 0) {
      process.stderr.write(`${formatEndpointManifestIssues(issues)}\n`);
      return 1;
    }
    process.stdout.write("Canonical endpoint manifest is current.\n");
    return 0;
  }
  const output = writeEndpointManifest(workspaceRoot);
  process.stdout.write(`Wrote canonical endpoint manifest: ${output}\n`);
  return 0;
}

// Executed directly by `pnpm nrb endpoints:manifest` (registerScript) with
// process.argv[2..] as command argv; imported lazily, never by tests.
process.exitCode = runGenerateEndpointManifest({ argv: process.argv.slice(2) });
