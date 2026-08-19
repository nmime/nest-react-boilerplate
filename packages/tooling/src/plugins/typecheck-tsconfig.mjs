#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const selfPath = fileURLToPath(import.meta.url);
const workspaceRoot = process.cwd();
const args = process.argv.slice(2);

/**
 * Each tsconfig gets a full TypeScript program, and the program for a
 * workspace app or library holds type info for every file it imports.
 * Building several programs in one process (the old behavior) kept the
 * earlier programs alive while the next one was being built, so a
 * typecheck target with app + spec configs peaked near the sum of both
 * programs. Running every tsconfig in a fresh child process releases the
 * whole heap between programs: the peak is the largest single program,
 * never their accumulation. The command line, diagnostics, and exit-code
 * contract are unchanged.
 */
function runChild(configPath) {
  const absoluteConfigPath = realpathSync(resolve(workspaceRoot, configPath));
  const config = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
  if (config.error) {
    reportDiagnostics([config.error]);
    return 1;
  }

  const isSpec = basename(absoluteConfigPath) === 'tsconfig.spec.json';
  const options = {
    allowImportingTsExtensions: isSpec ? true : undefined,
    composite: false,
    declaration: false,
    declarationMap: false,
    emitDeclarationOnly: false,
    incremental: false,
    module: isSpec ? ts.ModuleKind.ESNext : undefined,
    moduleResolution: isSpec ? ts.ModuleResolutionKind.Bundler : undefined,
    noEmit: true,
    rootDir: workspaceRoot,
  };
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(absoluteConfigPath),
    options,
    absoluteConfigPath,
  );
  if (parsed.errors.length > 0) {
    reportDiagnostics(parsed.errors);
    return 1;
  }

  // A no-emit verification target must not depend on declaration artifacts from
  // another concurrently scheduled Nx build. Source imports are resolved through
  // the workspace aliases, so project references are intentionally omitted here.
  const program = ts.createProgram({
    options: parsed.options,
    projectReferences: undefined,
    rootNames: parsed.fileNames,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    reportDiagnostics(diagnostics);
    return 1;
  }

  return 0;
}

let hasErrors = false;
if (args.length === 0) {
  process.stderr.write('Usage: node typecheck-tsconfig.mjs <tsconfig> [tsconfig...]\n');
  process.exitCode = 2;
} else if (args[0] === '--child') {
  if (args.length !== 2) {
    process.stderr.write('Usage: node typecheck-tsconfig.mjs --child <tsconfig>\n');
    process.exitCode = 2;
  } else {
    process.exitCode = runChild(args[1]);
  }
} else {
  for (const configPath of args) {
    // stdio is inherited so diagnostics stream in the same order as before;
    // spawnSync keeps the programs isolated, one full process per tsconfig.
    const result = spawnSync(process.execPath, [selfPath, '--child', configPath], {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
    if (result.error) {
      process.stderr.write(`Unable to start the typecheck child: ${result.error}\n`);
      hasErrors = true;
    } else if (result.status !== 0) {
      hasErrors = true;
    }
  }
  if (hasErrors) process.exitCode = 1;
}

function reportDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => workspaceRoot,
    getNewLine: () => ts.sys.newLine,
  };
  const output = ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
  process.stderr.write(output);
}
