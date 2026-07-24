// Minimal standalone migration entrypoint.
//
// Runs the DB migration command (`packages/tooling/src/commands/db/migrate.ts`)
// DIRECTLY via jiti, instead of routing through the full `@repo/tooling` CLI
// (`src/cli.ts`), which statically imports every command and would drag in
// heavy dev/test tooling (playwright, nx, sharp, istanbul, ...) — the source of
// the migrator image's CVE backlog. This entrypoint pulls in only the
// migration closure: MikroORM + pg + the `@app/backend-postgres-*` migration
// sources (transpiled on the fly by @swc-node/register + tsconfig-paths).
import { createJiti } from 'jiti';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url, {
  alias: {
    '@app/common-i18n-runtime': resolve(appRoot, 'libs/common/i18n/runtime/lib/src/index.ts'),
  },
});

// migrate.ts self-invokes main() and sets process exit codes.
await jiti.import(resolve(appRoot, 'packages/tooling/src/commands/db/migrate.ts'));
