import { spawnSync } from 'node:child_process';

export type ReconfigureGateMode = 'auto' | 'off';
export type ReconfigureGateOutcome = 'green' | 'skipped';
export interface VerificationCommand {
  name: string;
  command: string;
  args: string[];
}
export interface VerificationCommandResult {
  status: number;
  stdout?: string;
  stderr?: string;
}
export interface VerificationGateResult {
  outcome: ReconfigureGateOutcome;
  commands: string[];
  failedGate?: string;
  exitCode: number;
  error?: string;
}
export interface VerificationGateOptions {
  workspaceRoot: string;
  mode: ReconfigureGateMode;
  runCommand?: (command: VerificationCommand) => VerificationCommandResult;
  audit?: () => Promise<{ ok: boolean; report?: string }>;
}

export const verificationCommands: readonly VerificationCommand[] = [
  { name: 'static-check', command: 'pnpm', args: ['run', 'tooling:static-check'] },
  { name: 'format', command: 'pnpm', args: ['run', 'format:check'] },
  { name: 'docs', command: 'pnpm', args: ['run', 'docs:check'] },
  { name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
  { name: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { name: 'tests', command: 'pnpm', args: ['run', 'test'] },
  { name: 'endpoints-manifest', command: 'pnpm', args: ['run', 'endpoints:manifest:check'] },
  { name: 'spec-validate', command: 'pnpm', args: ['run', 'spec:validate'] },
  { name: 'i18n-catalogs', command: 'pnpm', args: ['run', 'i18n:catalogs:check'] },
  { name: 'frontend-fsd', command: 'pnpm', args: ['run', 'frontend:fsd:check'] },
] as const;

export async function runVerificationGate(options: VerificationGateOptions): Promise<VerificationGateResult> {
  if (options.mode === 'off') return { outcome: 'skipped', commands: [], exitCode: 0 };
  const completed: string[] = [];
  const runCommand = options.runCommand ?? defaultCommandRunner(options.workspaceRoot);
  for (const command of verificationCommands) {
    const result = runCommand(command);
    if (result.status !== 0) {
      const detail = result.stderr?.trim() || result.stdout?.trim();
      return {
        outcome: 'skipped',
        commands: completed,
        failedGate: command.name,
        exitCode: result.status || 1,
        error: `Verification gate "${command.name}" failed with exit code ${result.status || 1}${detail ? `:\n${detail}` : '.'}`,
      };
    }
    completed.push(command.name);
  }
  if (!options.audit)
    return {
      outcome: 'skipped',
      commands: completed,
      failedGate: 'audit',
      exitCode: 1,
      error: 'Verification gate "audit" failed: audit unavailable.',
    };
  const audit = await options.audit();
  if (!audit.ok)
    return {
      outcome: 'skipped',
      commands: completed,
      failedGate: 'audit',
      exitCode: 1,
      error: `Verification gate "audit" failed${audit.report ? `:\n${audit.report}` : '.'}`,
    };
  completed.push('audit');
  return { outcome: 'green', commands: completed, exitCode: 0 };
}
function defaultCommandRunner(workspaceRoot: string) {
  return (command: VerificationCommand): VerificationCommandResult => {
    const result = spawnSync(command.command, command.args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NX_DAEMON: process.env.NX_DAEMON ?? 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) return { status: 1, stderr: result.error.message };
    return { status: result.status ?? 1, stdout: result.stdout ?? undefined, stderr: result.stderr ?? undefined };
  };
}
