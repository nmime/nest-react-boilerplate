// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { packageManagerInvocation, run } from './process';

void describe('process runtime', () => {
  void it('reuses the active Corepack package-manager module without a shell', () => {
    assert.deepEqual(
      packageManagerInvocation(['exec', 'nx', '--version'], {
        env: { npm_execpath: 'C:\\corepack\\pnpm.cjs' },
        nodeExecutable: 'C:\\node\\node.exe',
        platform: 'win32',
      }),
      {
        command: 'C:\\node\\node.exe',
        args: ['C:\\corepack\\pnpm.cjs', 'exec', 'nx', '--version'],
      },
    );
  });

  void it('fails clearly on Windows when tooling was not launched through pnpm', () => {
    assert.throws(
      () => packageManagerInvocation(['run', 'test'], { env: {}, platform: 'win32' }),
      /invoke repository tooling through pnpm/u,
    );
  });

  void it('terminates a child process at its configured deadline', () => {
    const result = run(process.execPath, ['-e', 'setTimeout(() => undefined, 10_000)'], { timeoutMs: 50 });

    assert.equal(result.status, 1);
    assert.equal(result.timedOut, true);
  });
});
