import { writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vike/api';

import config from '../site.vite.config.mts';
import { findMissingVikeBuildOutputs } from './vike-build-output.mjs';

const distRoot = resolve(config.root, config.build.outDir, '..');

// Vike neither rejects nor exits non-zero when it fails to execute `+config.ts`: it logs the error
// and leaves `build()` pending, so Node drains the event loop and exits 0 having written nothing.
// Only the artefacts say whether the build ran, and only an exit hook is guaranteed to look —
// a pending promise is exactly what the code after `await build()` never reaches.
process.on('exit', () => {
  const missingOutputs = findMissingVikeBuildOutputs(distRoot);
  if (missingOutputs.length === 0) {
    return;
  }

  process.exitCode = 1;
  writeSync(
    2,
    `[site-app] Vike build produced no ${missingOutputs.join(', ')} under ${distRoot}.\n` +
      '[site-app] The Vike errors logged above are the cause.\n',
  );
});

await build({ viteConfig: { ...config, configFile: false } });
