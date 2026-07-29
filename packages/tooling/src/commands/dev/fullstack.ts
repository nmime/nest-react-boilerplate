#!/usr/bin/env node
import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGeneratedEnvironment } from '../../setup/environment.js';
import {
  validateSelectedDatabaseEnvironment,
  type SelectedDatabaseProvider,
} from '../docker/selected.js';
import type { SelectedClosureManifest } from '../../setup/closure.js';
import { validateCurrentClosure } from '../../setup/closure-workspace.js';

export interface FullstackSelection {
  projects: string[];
  capabilities: string[];
  source: 'setup';
}

export interface FullstackRuntime {
  provider?: SelectedDatabaseProvider;
  environment: NodeJS.ProcessEnv;
  environmentPath?: string;
}

type RunCommand = (command: string, args: string[], options?: SpawnOptions) => Promise<void>;
type ValidateClosure = (workspaceRoot: string) => Promise<SelectedClosureManifest>;

export async function resolveFullstackSelection(
  workspaceRoot: string,
  validateClosure: ValidateClosure = validateCurrentClosure,
): Promise<FullstackSelection> {
  const manifest = await validateClosure(workspaceRoot);
  const projects = manifest.targets['serve'] ?? [];
  const capabilities = manifest.provider ? [manifest.provider] : [];

  if (projects.length === 0) {
    throw new Error(
      '.nrb/closure.json selects no projects with a serve target; rerun `pnpm nrb setup` and select a runnable app.',
    );
  }
  return { projects, capabilities, source: 'setup' };
}

export function resolveFullstackRuntime(
  workspaceRoot: string,
  selection: FullstackSelection,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): FullstackRuntime {
  const selectedProviders = (['mongodb', 'postgres'] as const).filter((provider) =>
    selection.capabilities.includes(provider),
  );
  if (selectedProviders.length > 1) {
    throw new Error('The fullstack selection cannot enable both mongodb and postgres.');
  }
  if (selectedProviders.length === 0) {
    return {
      environment: {
        ...baseEnvironment,
        SESSION_SECRET: baseEnvironment.SESSION_SECRET ?? 'local-dev-session-secret-change-me',
        VITE_AUTH_API_BASE_URL: baseEnvironment.VITE_AUTH_API_BASE_URL ?? 'http://localhost:3003',
        VITE_USER_API_BASE_URL: baseEnvironment.VITE_USER_API_BASE_URL ?? 'http://localhost:3002',
        VITE_ADMIN_API_BASE_URL: baseEnvironment.VITE_ADMIN_API_BASE_URL ?? 'http://localhost:3001',
      },
    };
  }

  const environmentPath = join(workspaceRoot, '.nrb', 'capabilities.env');
  if (!existsSync(environmentPath)) {
    throw new Error('The selected database environment is missing; rerun `pnpm nrb setup`.');
  }
  const generatedEnvironment = parseGeneratedEnvironment(readFileSync(environmentPath, 'utf8'));
  const provider = validateSelectedDatabaseEnvironment(selectedProviders[0]!, generatedEnvironment);
  if (provider !== selectedProviders[0]) {
    throw new Error('.nrb/closure.json and .nrb/capabilities.env select different database providers.');
  }

  return {
    provider,
    environmentPath,
    environment: {
      ...baseEnvironment,
      ...generatedEnvironment,
      SESSION_SECRET: baseEnvironment.SESSION_SECRET ?? 'local-dev-session-secret-change-me',
      VITE_AUTH_API_BASE_URL: baseEnvironment.VITE_AUTH_API_BASE_URL ?? 'http://localhost:3003',
      VITE_USER_API_BASE_URL: baseEnvironment.VITE_USER_API_BASE_URL ?? 'http://localhost:3002',
      VITE_ADMIN_API_BASE_URL: baseEnvironment.VITE_ADMIN_API_BASE_URL ?? 'http://localhost:3001',
    },
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

export async function runFullstack(
  workspaceRoot = process.cwd(),
  execute: RunCommand = run,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  validateClosure: ValidateClosure = validateCurrentClosure,
): Promise<void> {
  const selection = await resolveFullstackSelection(workspaceRoot, validateClosure);
  const runtime = resolveFullstackRuntime(workspaceRoot, selection, baseEnvironment);

  if (runtime.provider) {
    const compose = [
      'compose',
      '--env-file',
      runtime.environmentPath!,
      '-f',
      join(workspaceRoot, 'docker', 'docker-compose.yml'),
    ];
    if (runtime.provider === 'mongodb') {
      await execute('docker', [...compose, 'up', '-d', 'mongodb'], {
        cwd: workspaceRoot,
        env: runtime.environment,
      });
      await execute('docker', [...compose, 'run', '--rm', 'mongodb-init'], {
        cwd: workspaceRoot,
        env: runtime.environment,
      });
    } else {
      await execute('docker', [...compose, 'up', '-d', '--wait', 'postgres'], {
        cwd: workspaceRoot,
        env: runtime.environment,
      });
    }
    await execute('node', ['packages/tooling/bin/repo-tooling.mjs', 'db', 'migrate'], {
      cwd: workspaceRoot,
      env: runtime.environment,
    });
  }

  console.log(`Starting ${selection.projects.join(', ')} (.nrb/closure.json selection).`);
  await execute(
    'pnpm',
    [
      'exec',
      'nx',
      'run-many',
      '-t',
      'serve',
      `--projects=${selection.projects.join(',')}`,
      `--parallel=${selection.projects.length}`,
    ],
    { cwd: workspaceRoot, env: runtime.environment },
  );
}

const invokedDirectly = process.argv[1]?.endsWith('fullstack.ts') || process.argv[1]?.endsWith('fullstack.js');
if (invokedDirectly) {
  await runFullstack();
}
