#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import ts from 'typescript';

const workspaceRoot = process.cwd();
const configPaths = process.argv.slice(2);

if (configPaths.length === 0) {
  process.stderr.write('Usage: node typecheck-tsconfig.mjs <tsconfig> [tsconfig...]\n');
  process.exitCode = 2;
} else {
  let hasErrors = false;

  for (const configPath of configPaths) {
    const absoluteConfigPath = realpathSync(resolve(workspaceRoot, configPath));
    const config = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
    if (config.error) {
      reportDiagnostics([config.error]);
      hasErrors = true;
      continue;
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
      hasErrors = true;
      continue;
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
