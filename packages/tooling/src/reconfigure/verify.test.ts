// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runVerificationGate, verificationCommands } from './verify.js';
describe('reconfigure verification gate', () => {
  it('runs the ordered gate and audit', async () => {
    const seen: string[] = [];
    const result = await runVerificationGate({
      workspaceRoot: '.',
      mode: 'auto',
      runCommand(command) {
        seen.push(command.name);
        return { status: 0 };
      },
      audit: async () => {
        seen.push('audit');
        return { ok: true };
      },
    });
    assert.equal(result.outcome, 'green');
    assert.deepEqual(seen, [...verificationCommands.map(({ name }) => name), 'audit']);
  });
  it('stops at and names the first failing gate', async () => {
    const result = await runVerificationGate({
      workspaceRoot: '.',
      mode: 'auto',
      runCommand(command) {
        return { status: command.name === 'docs' ? 7 : 0, stderr: 'broken literal' };
      },
      audit: async () => ({ ok: true }),
    });
    assert.equal(result.failedGate, 'docs');
    assert.equal(result.exitCode, 7);
    assert.match(result.error ?? '', /docs.*broken literal/su);
  });
});
