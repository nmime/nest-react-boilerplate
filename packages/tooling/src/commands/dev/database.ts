#!/usr/bin/env node
import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGeneratedEnvironment } from '../../setup/environment.js';
import type { SelectedClosureManifest } from '../../setup/closure.js';
import { validateCurrentClosure } from '../../setup/closure-workspace.js';
import {
  validateSelectedDatabaseEnvironment,
  type SelectedDatabaseProvider,
} from '../docker/selected.js';

export interface DevDatabaseRuntime {
  provider: SelectedDatabaseProvider;
  environment: NodeJS.ProcessEnv;
  environmentPath: string;
}

type RunCommand = (command: string, args: string[], options?: SpawnOptions) => Promise<void>;
type ValidateClosure = (workspaceRoot: string) => Promise<SelectedClosureManifest>;

export async function resolveDevDatabaseRuntime(
  workspaceRoot: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  validateClosure: ValidateClosure = validateCurrentClosure,
): Promise<DevDatabaseRuntime> {
  const closure = await validateClosure(workspaceRoot);
  if (!closure.provider) {
    throw new Error('The current selected closure is provider-free; select PostgreSQL or MongoDB with `pnpm nrb setup`.');
  }

  const environmentPath = join(workspaceRoot, '.nrb', 'capabilities.env');
  if (!existsSync(environmentPath)) {
    throw new Error('The selected database environment is missing; rerun `pnpm nrb setup`.');
  }

  const generatedEnvironment = parseGeneratedEnvironment(readFileSync(environmentPath, 'utf8'));
  const provider = validateSelectedDatabaseEnvironment(closure.provider, generatedEnvironment);
  if (!provider) throw new Error('The current selected closure is provider-free; rerun `pnpm nrb setup`.');

  return {
    provider,
    environmentPath,
    environment: { ...baseEnvironment, ...generatedEnvironment },
  };
}

const run: RunCommand = (command, args, options = {}) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    );
  });

export async function runDevDatabase(
  workspaceRoot = process.cwd(),
  execute: RunCommand = run,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  validateClosure: ValidateClosure = validateCurrentClosure,
): Promise<void> {
  const runtime = await resolveDevDatabaseRuntime(workspaceRoot, baseEnvironment, validateClosure);
  const compose = [
    'compose',
    '--env-file',
    runtime.environmentPath,
    '-f',
    join(workspaceRoot, 'docker', 'docker-compose.yml'),
    'up',
    '-d',
  ];
  const services = runtime.provider === 'mongodb' ? ['mongodb', 'mongodb-init'] : ['postgres'];

  await execute('docker', [...compose, ...services], {
    cwd: workspaceRoot,
    env: runtime.environment,
  });
}

const invokedDirectly = process.argv[1]?.endsWith('database.ts') || process.argv[1]?.endsWith('database.js');
if (invokedDirectly) {
  await runDevDatabase().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
