import type { CommandContext } from '../../cli.js';
import { createNodeFilesystem } from '../../setup/adapters/node-filesystem.js';
import { defaultConfigPath } from '../../reconfigure/engine.js';
import {
  assertCleanGitWorkspace,
  loadDesiredConfig,
  loadIdentityManifest,
  loadSetupState,
  resolvePreviousConfig,
  templateBase,
} from '../../reconfigure/io.js';
import { auditWorkspace } from '../../reconfigure/audit.js';
import { runReconfigure } from '../../reconfigure/run.js';
import type { ReconfigureGateMode } from '../../reconfigure/verify.js';

export interface ReconfigureArgs {
  config?: string;
  gate: ReconfigureGateMode;
  audit: boolean;
  dryRun: boolean;
  force: boolean;
  json: boolean;
  help: boolean;
}

export function parseReconfigureArgs(argv: string[]): ReconfigureArgs {
  const result: ReconfigureArgs = { gate: 'auto', audit: false, dryRun: false, force: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === '--') break;
    if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--audit') result.audit = true;
    else if (argument === '--gate') result.gate = parseGate(requireValue(argv, ++i, '--gate'));
    else if (argument.startsWith('--gate=')) result.gate = parseGate(inlineValue(argument, '--gate'));
    else if (argument === '--dry-run' || argument === '--dryRun') result.dryRun = true;
    else if (argument === '--force') result.force = true;
    else if (argument === '--json') result.json = true;
    else if (argument === '--config') result.config = requireValue(argv, ++i, '--config');
    else if (argument.startsWith('--config=')) result.config = inlineValue(argument, '--config');
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (result.audit && result.dryRun) throw new Error('--audit cannot be combined with --dry-run.');
  return result;
}

export async function runReconfigureFromContext(context: CommandContext): Promise<number> {
  let args: ReconfigureArgs;
  try {
    args = parseReconfigureArgs(context.argv);
  } catch (error) {
    return reportError(error);
  }
  if (args.help) {
    printUsage();
    return 0;
  }

  try {
    assertCleanGitWorkspace(context.workspaceRoot, args.force || args.dryRun || args.audit);
    const fs = createNodeFilesystem(context.workspaceRoot);
    const desired = loadDesiredConfig(context.workspaceRoot, args.config);
    const manifest = await loadIdentityManifest(fs);
    const state = await loadSetupState(fs);
    if (args.audit) {
      const audit = await auditWorkspace(fs, desired);
      process[audit.ok ? 'stdout' : 'stderr'].write(`${audit.report}\n`);
      return audit.ok ? 0 : 1;
    }
    const result = await runReconfigure({
      fs,
      desired,
      previous: resolvePreviousConfig(desired, manifest),
      manifest,
      state,
      templateBase: manifest?.templateBase ?? templateBase(context.workspaceRoot),
      workspaceRoot: context.workspaceRoot,
      gate: args.gate,
      audit: async () => {
        const audit = await auditWorkspace(fs, desired);
        return { ok: audit.ok, report: audit.report };
      },
      dryRun: args.dryRun,
      force: args.force,
    });

    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            status: result.status,
            config: desired,
            filesChanged: result.plan.rewriteOperations.length,
            files: result.plan.files,
            gate: result.gate,
            failedGate: result.failedGate,
          },
          null,
          2,
        )}\n`,
      );
    } else if (result.status === 'dry-run') {
      printPlan(result.plan.rewriteOperations);
    } else if (result.status === 'already-up-to-date') {
      process.stdout.write(`✓ Workspace identity is already up to date (gate: ${result.gate}).\n`);
    } else if (result.status === 'updated') {
      process.stdout.write(
        `✓ Reconfigure complete: ${result.plan.rewriteOperations.length} files updated (gate: ${result.gate}).\n`,
      );
    }

    if (result.status === 'conflict') {
      process.stderr.write(formatConflicts(result.conflicts.map((conflict) => conflict.path)));
      return 1;
    }
    if (result.status === 'rolled-back') {
      process.stderr.write(
        `Reconfigure failed${result.failedGate ? ` at gate "${result.failedGate}"` : ''} and all files were rolled back: ${result.error ?? 'unknown error'}\n`,
      );
      return 1;
    }
    return 0;
  } catch (error) {
    return reportError(error);
  }
}

function printPlan(operations: readonly { path: string }[]): void {
  if (operations.length === 0) {
    process.stdout.write('Already up to date — zero file operations.\n');
    return;
  }
  for (const operation of operations) process.stdout.write(`UPDATE ${operation.path}\n`);
}

function formatConflicts(paths: readonly string[]): string {
  return [
    `Refused to overwrite ${paths.length} tracked ${paths.length === 1 ? 'file' : 'files'} whose content drifted:`,
    ...paths.map((path) => `  ${path}`),
    'Restore the file or pass --force to overwrite.',
    '',
  ].join('\n');
}

function parseGate(value: string): ReconfigureGateMode {
  if (value !== 'auto' && value !== 'off') throw new Error('--gate must be either auto or off.');
  return value;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function inlineValue(argument: string, option: string): string {
  const value = argument.slice(option.length + 1);
  if (!value) throw new Error(`${option} requires a value.`);
  return value;
}

function reportError(error: unknown): number {
  process.stderr.write(`Configuration error: ${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
}

function printUsage(): void {
  process.stdout.write(`Usage: pnpm nrb reconfigure [options]

Apply the identity/runtime state in nrb.config.json to this checkout.

Options:
  --config <path>  Read desired state from another JSON config (default: ${defaultConfigPath})
  --gate auto|off  Run ordered verification (default: auto)
  --audit          Check cross-artifact consistency without writing
  --dry-run        Print the ordered file plan without writing
  --force          Overwrite drifted tracked files and permit a dirty worktree
  --json           Emit the stable {status, config, filesChanged, files} result
  -h, --help       Show this help
`);
}
