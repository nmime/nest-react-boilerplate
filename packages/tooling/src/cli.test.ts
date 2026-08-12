// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { main } from './cli';
import { localeCatalogBindings, renderLocaleCatalogBinding } from './commands/i18n/catalog-bindings.ts';
import { renderTranslationKeyModule } from './commands/i18n/translation-keys.ts';

void describe('repository tooling command surface', () => {
  // A generator nobody can invoke is a generator that goes stale. The locale catalog
  // bindings and the translation-key module are derived artifacts, so the command that
  // regenerates them — and the `--check` half that fails when they drift — has to be
  // reachable from the CLI, not only from a unit test.
  void it('exposes the locale catalog generator and its staleness check', async () => {
    assert.equal(await main(['i18n', 'catalogs', '--check']), 0);
  });

  void it('reports an unknown command instead of exiting zero', async () => {
    assert.equal(await main(['i18n', 'catalgos']), 1);
  });

  // "Do not edit by hand" is only actionable when the command in the same breath exists. A
  // header naming a command the dispatcher never registered sends the next author looking for
  // a regeneration path that is not there, and hand-editing is what they do instead.
  void it('dispatches every command a generated locale artifact tells the reader to run', async () => {
    const headers = [
      renderTranslationKeyModule(['landing.title']),
      renderLocaleCatalogBinding(process.cwd(), localeCatalogBindings[0]!),
    ].map((module) => module.split('\n', 1)[0] ?? '');

    for (const header of headers) {
      const command = /`pnpm nrb ([^`]+)`/u.exec(header)?.[1];
      assert.ok(command !== undefined, `generated header names no regeneration command: ${header}`);
      assert.equal(await main([...command.split(' '), '--check']), 0, `unreachable: pnpm nrb ${command}`);
    }
  });
});
