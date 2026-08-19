import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { runCheckFrontendFsd } from './commands/frontend/check-fsd';
import { runToastConfigCheck, runToastConfigGenerate } from './commands/api/toast-config';
import { fileURLToPath } from 'node:url';
import { runCheckLibraryConfigs } from './commands/project/check-library-configs';
import { runDependencyMap } from './commands/project/dependency-map';
import { runGenerateVerticalSliceFromContext } from './commands/project/generate-vertical-slice';
import { runSetupFromContext } from './commands/project/setup';
import { runDoctorFromContext } from './commands/project/doctor';
import { runAddFromContext } from './commands/project/add';
import { runBundleBudget } from './commands/qa/bundle-budget';
import { runMutation } from './commands/qa/mutation';
import { runTestOrchestration } from './commands/qa/test-orchestration';
import { runBranchCleanup } from './commands/git/branch-cleanup';
import { runGitConventions } from './commands/git/conventions';
import { runWebpCommand } from './commands/images/webp';
import { runChangedFormatCheck, runStaticCheck } from './commands/tooling/static-check';
import { runBunCompatibilityCommand } from './commands/tooling/bun-compat';
import { runSpecImpact } from './commands/spec/impact';
import { runSpecReport } from './commands/spec/report';
import { runSpecTrace } from './commands/spec/trace';
import { runSpecValidate } from './commands/spec/validate';
import { runSpecVerify } from './commands/spec/verify';
import { runShadcnAddCommand, runUiRegistryAddCommand, runUiRegistrySearchCommand } from './commands/ui/shadcn-add';
import { runClosureFromContext } from './commands/project/closure';
import { run } from './runtime/process';

export interface CommandContext {
  argv: string[];
  packageRoot: string;
  workspaceRoot: string;
}

type CommandHandler = (context: CommandContext) => number | Promise<number>;

interface CommandDefinition {
  description: string;
  handler: CommandHandler;
  forwardHelp?: boolean;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '../..');
const TOOLING_VERSION = '0.0.0'; // sync with packages/tooling/package.json
const writeStdoutLine = (message = ''): void => {
  process.stdout.write(`${message}\n`);
};
const writeStderrLine = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const commands = new Map<string, CommandDefinition>();

/**
 * Every registered CLI command name. Exported so `tooling:static-check` can
 * resolve `tooling <cmd>` / `nrb <cmd>` invocations inside package.json
 * scripts against the same table the CLI dispatches on, instead of a copy.
 */
export function registeredCommandNames(): ReadonlySet<string> {
  return new Set(commands.keys());
}

register(
  'git:branch-cleanup',
  'Safely preview or delete local/remote branches already merged into the target branch.',
  runBranchCleanup,
);
register(
  'git:conventions',
  'Validate branch naming, commit messages, linear history, and agent attribution.',
  runGitConventions,
);
register('images:webp', 'Find PNG/JPG/JPEG assets and convert them to WebP.', ({ argv, workspaceRoot }) =>
  runWebpCommand({ argv, workspaceRoot }),
);
register(
  'ui:shadcn:add',
  'Preview or add an official shadcn component only to the shared web UI package.',
  runShadcnAddCommand,
  true,
);
register(
  'ui:registry:add',
  'Preview or add source from an approved free UI registry under shared web UI policy.',
  runUiRegistryAddCommand,
  true,
);
register(
  'ui:registry:search',
  'Search an explicitly selected approved UI registry without writing source.',
  runUiRegistrySearchCommand,
  true,
);

register('frontend:fsd:check', 'Enforce strict frontend Feature-Sliced Design boundaries.', ({ argv, workspaceRoot }) =>
  runCheckFrontendFsd({ argv, workspaceRoot }),
);

register('project:check-library-configs', 'Validate Nx library config placement.', ({ workspaceRoot }) =>
  runCheckLibraryConfigs({ workspaceRoot }),
);
register('project:dependency-map', 'Show dependency ownership across workspace scopes.', ({ argv, workspaceRoot }) =>
  runDependencyMap({ argv, workspaceRoot }),
);
register(
  'project:generate-vertical-slice',
  'Scaffold a checklist-driven product vertical slice.',
  runGenerateVerticalSliceFromContext,
);
register('project:setup', 'Interactive and non-interactive boilerplate configuration.', runSetupFromContext, true);
register(
  'project:doctor',
  'Run workspace health checks (Node, pnpm, Docker, manifests, config).',
  runDoctorFromContext,
);
register('setup', 'Shorthand for project:setup — boilerplate configuration.', runSetupFromContext, true);
register('doctor', 'Shorthand for project:doctor — workspace health checks.', runDoctorFromContext);
register('add', 'Add an app, library, or feature to the workspace.', runAddFromContext, true);
register(
  'closure',
  'Check, install, or run the setup-selected project and package closure.',
  runClosureFromContext,
  true,
);
register('qa:mutation', 'Run Stryker mutation testing or write its dry-run report.', ({ argv, workspaceRoot }) =>
  runMutation({ argv, workspaceRoot }),
);
register(
  'qa:bundle-budget',
  'Enforce per-app JavaScript, CSS, and single-chunk byte budgets on built frontends.',
  ({ argv, workspaceRoot }) => runBundleBudget({ argv, workspaceRoot }),
);
register('qa:test-aggregate', 'Run resource-aware aggregate unit or coverage tests.', ({ argv, workspaceRoot }) =>
  runTestOrchestration({ argv, workspaceRoot }),
);
register(
  'spec:validate',
  'Strictly validate OpenSpec artifacts and repository evidence ownership.',
  ({ argv, workspaceRoot }) => runSpecValidate({ argv, workspaceRoot }),
);
register('spec:trace', 'Build the requirement-to-project-and-test trace graph.', ({ argv, workspaceRoot }) =>
  runSpecTrace({ argv, workspaceRoot }),
);
register(
  'spec:impact',
  'Resolve changed files to affected requirements and evidence commands.',
  ({ argv, workspaceRoot }) => runSpecImpact({ argv, workspaceRoot }),
);
register(
  'spec:verify',
  'Run fresh evidence for affected or all requirements and write an assurance dossier.',
  ({ argv, workspaceRoot }) => runSpecVerify({ argv, workspaceRoot }),
);
register(
  'spec:report',
  'Render a human-readable assurance dossier from its JSON evidence.',
  ({ argv, workspaceRoot }) => runSpecReport({ argv, workspaceRoot }),
);
register(
  'tooling:bun-compat',
  'Run the pinned Bun compatibility contract across builds, tests, and runtime smokes.',
  runBunCompatibilityCommand,
);
register(
  'tooling:static-check',
  'Run TS-first static validation and safe import smoke checks for repo tooling commands.',
  ({ workspaceRoot }) => runStaticCheck({ workspaceRoot }),
);
register(
  'tooling:changed-format-check',
  'Run Prettier only on changed files for PR memory-safe formatting validation.',
  ({ argv, workspaceRoot }) => runChangedFormatCheck({ argv, workspaceRoot }),
);

registerScript('testing:storybook', 'Run Storybook interaction tests.', 'testing/storybook-test.ts');
registerScript(
  'testing:storybook-visual',
  'Run Storybook visual regression tests.',
  'testing/storybook-visual-regression.ts',
);
registerScript(
  'testing:frontend-static-smoke',
  'Smoke-test a built frontend app from static assets.',
  'testing/frontend-static-smoke.ts',
);
registerScript(
  'testing:frontend-browser-e2e-coverage',
  'Run browser e2e smoke coverage against a built frontend app.',
  'testing/frontend-browser-e2e-coverage.ts',
);
registerScript('db:migrate', 'Run database migrations.', 'db/migrate.ts');
registerScript('db:migrations:check', 'Check database migration naming and drift.', 'db/migrations-check.ts');
registerScript(
  'db:migrations:rollback-check',
  'Run auth migrations up/down/up against disposable PostgreSQL.',
  'db/migrations-rollback-check.ts',
);
registerScript('db:reset', 'Reset the local database.', 'db/reset.ts');
registerScript('db:seed', 'Seed the local database.', 'db/seed.ts');
registerScript('db:backup', 'Create a selected-provider backup.', 'db/backup.ts');
registerScript('db:restore', 'Restore a selected-provider backup.', 'db/restore.ts');
registerScript(
  'db:restore-drill',
  'Run a selected-provider backup/restore drill or CI-safe dry-run.',
  'db/restore-drill.ts',
);
registerScript(
  'i18n:catalogs',
  'Regenerate every artifact derived from the locale axis; --check reports drift instead.',
  'i18n/catalogs.ts',
);
registerScript('dev:database', 'Start the setup-selected local database.', 'dev/database.ts');
registerScript('dev:fullstack', 'Run the local fullstack dev helper.', 'dev/fullstack.ts');
registerScript('docker:smoke', 'Run Docker smoke checks.', 'docker/smoke.ts');
registerScript('docker:fullstack-e2e', 'Run Docker fullstack e2e checks.', 'docker/fullstack-e2e.ts');
registerScript('docker:selected', 'Run Docker Compose for the generated setup selection.', 'docker/selected.ts', true);
registerScript('project:init', 'Initialize project placeholders.', 'project/init-project.ts', true);
registerScript('init', 'Initialize product identity and all example domains.', 'project/init-project.ts', true);
registerScript('api:openapi', 'Export OpenAPI contracts.', 'api/export-openapi.ts');
registerScript('api:clients', 'Generate API clients.', 'api/generate-clients.ts');
registerScript('api:clients:check', 'Check generated API clients.', 'api/check-clients.ts');
registerScript('api:contracts', 'Generate API contracts.', 'api/generate-contracts.ts');
registerScript('api:contracts:check', 'Check generated API contracts.', 'api/check-contracts.ts');
register(
  'api:toast-config:generate',
  'Generate app-local API toast rule JSON from OpenAPI contracts.',
  ({ argv, workspaceRoot }) => runToastConfigGenerate({ argv, workspaceRoot }),
);
register(
  'api:toast-config:check',
  'Validate app-local API toast rule JSON against OpenAPI contracts.',
  ({ argv, workspaceRoot }) => runToastConfigCheck({ argv, workspaceRoot }),
);
registerScript('qa:consumer-contracts', 'Validate consumer contracts.', 'qa/consumer-contracts.ts');
registerScript('qa:openapi-lint', 'Lint OpenAPI contracts.', 'qa/openapi-lint.ts');
registerScript('qa:openapi-fuzz', 'Generate OpenAPI fuzz cases.', 'qa/openapi-fuzz.ts');
registerScript('qa:accessibility', 'Run accessibility checks.', 'qa/accessibility.ts');
registerScript('qa:cross-browser-e2e', 'Run cross-browser e2e matrix.', 'qa/cross-browser-e2e.ts');
registerScript('qa:performance', 'Run performance checks.', 'qa/performance.ts');
registerScript('qa:security-sast', 'Run SAST checks.', 'qa/security-sast.ts');
registerScript('qa:secret-scan', 'Run secret scanning checks.', 'qa/secret-scan.ts');
registerScript('qa:security-dast', 'Run DAST checks.', 'qa/security-dast.ts');
registerScript('qa:security-suite', 'Run the security suite.', 'qa/security-suite.ts');
registerScript('qa:property', 'Run property-based checks.', 'qa/property.ts');
registerScript('qa:world-class-gates', 'Run world-class quality gates.', 'qa/world-class-gates.ts');

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv[0] === '--version' || argv[0] === '-v') {
    writeStdoutLine(TOOLING_VERSION);
    return 0;
  }

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return 0;
  }

  const resolved = resolveCommand(argv);

  if (resolved === undefined) {
    writeStderrLine(`Unknown tooling command: ${argv[0] ?? ''}`);
    printHelp();
    return 1;
  }

  if (resolved.argv[0] === '--help' || resolved.argv[0] === '-h') {
    if (resolved.command.forwardHelp) {
      return await resolved.command.handler({ argv: ['--help'], packageRoot, workspaceRoot });
    }
    printCommandHelp(resolved.name, resolved.command);
    return 0;
  }

  const commandArgv = resolved.argv[0] === '--' ? resolved.argv.slice(1) : resolved.argv;

  return await resolved.command.handler({
    argv: commandArgv,
    packageRoot,
    workspaceRoot,
  });
}

function register(name: string, description: string, handler: CommandHandler, forwardHelp = false): void {
  commands.set(name, { description, handler, forwardHelp });
}

function registerScript(name: string, description: string, commandPath: string, forwardHelp = false): void {
  register(
    name,
    description,
    ({ argv, packageRoot, workspaceRoot }) => {
      const commandModule = resolve(packageRoot, 'src/commands', commandPath);

      if (!existsSync(commandModule)) {
        writeStderrLine(`Tooling command module not found: ${commandModule}`);
        return 1;
      }

      const result = run(process.execPath, [resolve(packageRoot, 'bin/run-ts-command.mjs'), commandModule, ...argv], {
        cwd: workspaceRoot,
        stdio: 'inherit',
      });

      return result.status;
    },
    forwardHelp,
  );
}

function resolveCommand(argv: string[]): { name: string; command: CommandDefinition; argv: string[] } | undefined {
  for (let tokenCount = Math.min(argv.length, 3); tokenCount > 0; tokenCount -= 1) {
    const commandName = argv.slice(0, tokenCount).join(':');
    const command = commands.get(commandName);

    if (command !== undefined) {
      return {
        name: commandName,
        command,
        argv: argv.slice(tokenCount),
      };
    }
  }

  return undefined;
}

function printHelp(): void {
  writeStdoutLine('Usage: pnpm nrb <command> [args]');
  writeStdoutLine();
  writeStdoutLine('Commands:');

  for (const [name, command] of [...commands.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    writeStdoutLine(`  ${name.padEnd(30)} ${command.description}`);
  }
}

function printCommandHelp(name: string, command: CommandDefinition): void {
  writeStdoutLine(`Usage: pnpm nrb ${name} [args]`);
  writeStdoutLine();
  writeStdoutLine(command.description);
}
