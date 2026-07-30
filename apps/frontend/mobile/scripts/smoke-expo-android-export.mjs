import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultAndroidOutputRoot = join(import.meta.dirname, '../../../../dist/apps/frontend/mobile-android');

export function assertExpoAndroidExport(outputRoot = defaultAndroidOutputRoot) {
  const metadataPath = join(outputRoot, 'metadata.json');
  assert.equal(existsSync(metadataPath), true, `Missing Expo Android metadata: ${metadataPath}`);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  assert.equal(metadata.bundler, 'metro');

  const android = metadata.fileMetadata?.android;
  assert.ok(android, 'Expo metadata does not contain an Android export.');
  assert.match(android.bundle, /^_expo\/static\/js\/android\/(?:entry|index)-.+\.hbc$/u);

  const bundlePath = join(outputRoot, android.bundle);
  assert.equal(existsSync(bundlePath), true, `Missing Android Hermes bundle: ${bundlePath}`);
  assert.ok(statSync(bundlePath).size > 0, 'Android Hermes bundle is empty.');
  assert.ok(android.assets.length > 0, 'Android export did not include runtime assets.');
  for (const asset of android.assets) {
    assert.equal(existsSync(join(outputRoot, asset.path)), true, `Missing Android export asset: ${asset.path}`);
  }

  return { bundle: android.bundle, metadataPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify({
      ...assertExpoAndroidExport(),
      boundary: 'Metro/Hermes bundle export; no APK install, simulator launch, signing, or device startup',
      platform: 'android',
      status: 'ok',
    }),
  );
}
