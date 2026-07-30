import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExpoAndroidExport, defaultAndroidOutputRoot } from './smoke-expo-android-export.mjs';
import { assertExpoWebExport, defaultWebOutputRoot } from './smoke-expo-export.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const defaultExpoCli = resolve(appRoot, 'node_modules/expo/bin/cli');

const platformConfigs = {
  android: {
    args: ['export', '--platform', 'android', '--max-workers', '2'],
    outputRoot: defaultAndroidOutputRoot,
    verify: assertExpoAndroidExport,
  },
  web: {
    args: ['export', '--platform', 'web'],
    outputRoot: defaultWebOutputRoot,
    verify: assertExpoWebExport,
  },
};

const failure = (message, exitCode = 1) => Object.assign(new Error(message), { exitCode });

export function runExpoExports({
  expoCli = defaultExpoCli,
  outputRoots = {},
  platform = 'all',
  spawn = spawnSync,
} = {}) {
  if (!['all', 'android', 'web'].includes(platform)) {
    throw failure('Usage: export-expo.mjs --platform <web|android|all>', 2);
  }

  const selectedPlatforms = platform === 'all' ? ['web', 'android'] : [platform];
  const results = [];
  for (const selectedPlatform of selectedPlatforms) {
    const config = platformConfigs[selectedPlatform];
    const outputRoot = outputRoots[selectedPlatform] ?? config.outputRoot;
    rmSync(outputRoot, { force: true, recursive: true });
    const result = spawn(process.execPath, [expoCli, ...config.args, '--output-dir', outputRoot], {
      cwd: appRoot,
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
      stdio: 'inherit',
    });
    if (result.error) {
      throw failure(`Unable to start Expo ${selectedPlatform} export: ${result.error.message}`);
    }
    if (result.signal) {
      throw failure(`Expo ${selectedPlatform} export terminated by ${result.signal}.`);
    }
    if (result.status !== 0) {
      throw failure(`Expo ${selectedPlatform} export exited with ${result.status}.`, result.status ?? 1);
    }

    results.push({ platform: selectedPlatform, ...config.verify(outputRoot) });
  }

  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platformIndex = process.argv.indexOf('--platform');
  const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : undefined;
  try {
    const results = runExpoExports({ platform });
    console.log(
      JSON.stringify({
        boundary: 'Expo export artifacts only; no APK install, simulator launch, signing, or device startup',
        results,
        status: 'ok',
      }),
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
