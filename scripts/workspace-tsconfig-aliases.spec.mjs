// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { workspaceTsconfigAliases } from '../config/vite/workspace-tsconfig-aliases.mjs';

// Vite matches string aliases by prefix, first entry wins, in the order the object declares them.
// So a library's secondary entry point — `@app/x/y` next to `@app/x` — only resolves if it is
// declared first; declared second it silently rewrites to `<path-to-x-index.ts>/y`, and the import
// fails with "does the file exist?" pointing at a file that is right there.
test('declares an alias before any alias whose prefix it extends', () => {
  const aliases = Object.keys(workspaceTsconfigAliases());

  for (const [index, alias] of aliases.entries()) {
    const shadowingIndex = aliases.findIndex((other) => alias.startsWith(`${other}/`));

    assert.ok(
      shadowingIndex === -1 || shadowingIndex > index,
      `${aliases[shadowingIndex]} is declared before ${alias} and would swallow it`,
    );
  }
});

test('resolves every alias to an absolute workspace path', () => {
  const targets = Object.values(workspaceTsconfigAliases());

  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.ok(target.startsWith('/'), `${target} is not absolute`);
  }
});
