import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createNodesFromFiles, normalizePath, type CreateNodes, type CreateNodesResult } from '@nx/devkit';

interface ProjectJson {
  targets?: Record<string, unknown>;
}

const projectGlob = '{apps,libs}/**/project.json';

export const createNodes: CreateNodes = [
  projectGlob,
  async (projectFiles, options, context) =>
    createNodesFromFiles(
      (projectFile) => createTypecheckProject(projectFile, context.workspaceRoot),
      projectFiles,
      options,
      context,
    ),
];

export function createTypecheckProject(projectFile: string, workspaceRoot: string): CreateNodesResult {
  const project = JSON.parse(readFileSync(join(workspaceRoot, projectFile), 'utf8')) as ProjectJson;
  if (project.targets?.typecheck !== undefined) {
    return {};
  }

  const projectRoot = normalizePath(dirname(projectFile));
  const configs = typecheckConfigs(projectRoot, workspaceRoot);
  if (configs.length === 0) {
    return {};
  }

  const commands = configs.map((config) => {
    const moduleOptions = config.endsWith('tsconfig.spec.json')
      ? ' --module esnext --moduleResolution bundler --allowImportingTsExtensions true'
      : '';
    return `node node_modules/typescript/bin/tsc --noEmit --composite false --declaration false --project ${config} --rootDir .${moduleOptions}`;
  });

  return {
    projects: {
      [projectRoot]: {
        targets: {
          typecheck: {
            executor: 'nx:run-commands',
            cache: true,
            inputs: ['default', '^production', { externalDependencies: ['typescript'] }],
            options: {
              command: commands.join(' && '),
            },
            metadata: {
              technologies: ['typescript'],
              description: 'Typechecks project source and test TypeScript without emitting files.',
            },
          },
        },
      },
    },
  };
}

function typecheckConfigs(projectRoot: string, workspaceRoot: string): string[] {
  const has = (file: string): boolean => existsSync(join(workspaceRoot, projectRoot, file));
  let primary: string | undefined;
  if (has('tsconfig.app.json')) {
    primary = 'tsconfig.app.json';
  } else if (has('tsconfig.lib.json')) {
    primary = 'tsconfig.lib.json';
  } else if (has('tsconfig.json')) {
    primary = 'tsconfig.json';
  }

  if (primary === undefined) {
    return [];
  }

  const configs = [normalizePath(join(projectRoot, primary))];
  if (primary !== 'tsconfig.json' && has('tsconfig.spec.json')) {
    configs.push(normalizePath(join(projectRoot, 'tsconfig.spec.json')));
  }

  return configs;
}
