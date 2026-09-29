// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const runScanner = (directory: string, command: string, engine: string, extraArgs: readonly string[] = []) =>
  spawnSync(process.execPath, [
    resolve(root, 'packages/tooling/bin/run-ts-command.mjs'),
    resolve(root, `packages/tooling/src/commands/qa/${command}.ts`),
    '--engine', engine, ...extraArgs,
  ], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, PATH: `${join(directory, 'bin')}${delimiter}${process.env.PATH ?? ''}` },
  });

function withScannerFixture(name: string, source: string, test: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-security-scanner-'));
  try {
    mkdirSync(join(directory, 'bin'));
    const executable = join(directory, 'bin', name);
    writeFileSync(executable, `#!${process.execPath}\n${source}`);
    chmodSync(executable, 0o755);
    test(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

void describe('external security scanner gates', { skip: process.platform === 'win32' }, () => {
  void it('fails when Semgrep returns findings rather than treating scan completion as a pass', () => {
    withScannerFixture('semgrep', `
      process.stdout.write(JSON.stringify({ results: [{ check_id: 'test-finding' }] }));
      process.exit(process.argv.includes('--error') ? 1 : 0);
    `, (directory) => {
      const result = runScanner(directory, 'security-sast', 'semgrep');
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(readFileSync(join(directory, 'test-results/security-sast/report.json'), 'utf8'));
      assert.equal(report.status, 'failed');
      assert.equal(report.findings[0].rule, 'semgrep');
      assert.deepEqual(JSON.parse(readFileSync(join(directory, report.semgrepReport), 'utf8')).results, [{ check_id: 'test-finding' }]);
    });
  });

  void it('runs Gitleaks on a fresh checkout and preserves its report beside the summary', () => {
    withScannerFixture('gitleaks', `
      const { writeFileSync, existsSync } = require('node:fs');
      if (!existsSync('source.ts') || existsSync('dist/build.js')) process.exit(2);
      const path = process.argv[process.argv.indexOf('--report-path') + 1];
      writeFileSync(path, '[]');
    `, (directory) => {
      assert.equal(existsSync(join(directory, 'test-results')), false);
      writeFileSync(join(directory, 'source.ts'), 'export const source = true;');
      mkdirSync(join(directory, 'dist'));
      writeFileSync(join(directory, 'dist/build.js'), 'generated build output');
      const result = runScanner(directory, 'secret-scan', 'gitleaks');
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(readFileSync(join(directory, 'test-results/security-secrets/report.json'), 'utf8'));
      assert.equal(report.status, 'ok');
      assert.deepEqual(JSON.parse(readFileSync(join(directory, report.gitleaksReport), 'utf8')), []);
      const absoluteReport = join(directory, 'custom-reports', 'absolute.json');
      const absoluteResult = runScanner(directory, 'secret-scan', 'gitleaks', ['--report', absoluteReport]);
      assert.equal(absoluteResult.status, 0, absoluteResult.stderr);
      assert.equal(JSON.parse(readFileSync(absoluteReport, 'utf8')).status, 'ok');
    });
  });
});
