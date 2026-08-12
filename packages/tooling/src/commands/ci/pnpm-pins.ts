import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { declaredPipelineFiles } from './check-pipelines';

export interface PipelineSource {
  /** Workspace-relative path, so a reported mismatch names a file a reader can open. */
  name: string;
  source: string;
}

/**
 * Every pipeline file that could install pnpm, taken from the gate descriptor rather than from
 * `.github/workflows`. Scoping the scan to one forge's directory left the shipped GitLab pin
 * compared against nothing at all, and made the check throw on a checkout that keeps a single
 * non-GitHub forge.
 *
 * A forge whose pipelines live in a directory of their own is scanned whole: a pin drifts just
 * as easily in a workflow the descriptor never names — `dependency-review.yml` is one — as in
 * one it does. A forge whose pipeline sits at the workspace root contributes only that file;
 * the root is not a pipeline directory.
 */
export function pnpmPinSources(workspaceRoot: string): PipelineSource[] {
  const files = new Set<string>();

  for (const file of declaredPipelineFiles(workspaceRoot)) {
    files.add(file);
    const directory = dirname(file);
    if (directory === '.') continue;
    const absoluteDirectory = resolve(workspaceRoot, directory);
    if (!existsSync(absoluteDirectory)) continue;
    for (const entry of readdirSync(absoluteDirectory)) {
      if (/\.ya?ml$/u.test(entry)) files.add(`${directory}/${entry}`);
    }
  }

  return [...files].sort().flatMap((name) => {
    const absolute = resolve(workspaceRoot, name);
    return existsSync(absolute) ? [{ name, source: readFileSync(absolute, 'utf8') }] : [];
  });
}

/**
 * The pin spellings the shipped forges use: a pipeline-level variable, a version handed to the
 * GitHub setup action, and a version written straight into `corepack prepare`. Only literal
 * versions count — `corepack prepare pnpm@$PNPM_VERSION` is the variable pin, already checked.
 */
function pinsIn(source: string): string[] {
  const pins = [
    /PNPM_VERSION[:=]\s*["']?(\d+\.\d+\.\d+)/gu,
    /corepack prepare pnpm@(\d+\.\d+\.\d+)/gu,
  ].flatMap((pattern) =>
    [...source.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );

  if (source.includes('pnpm/action-setup')) {
    for (const block of source.split('pnpm/action-setup').slice(1)) {
      const literal = /^@[^\n]+\n\s+with:\n\s+version:\s*(\d+\.\d+\.\d+)/mu.exec(block);
      if (literal?.[1] !== undefined) pins.push(literal[1]);
    }
  }

  return pins;
}

export function mismatchedPnpmPins(sources: readonly PipelineSource[], expected: string): string[] {
  return sources.flatMap(({ name, source }) =>
    pinsIn(source)
      .filter((pin) => pin !== expected)
      .map((pin) => `${name}: ${pin}`),
  );
}
