// @requirements REQ-FRONTEND-NATIVE-006
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runExpoExports } from './export-expo.mjs';

const temporaryRoots = [];

const writeAndroidFixture = (root, bundleName = 'entry-test.hbc') => {
  const bundle = `_expo/static/js/android/${bundleName}`;
  const asset = 'assets/test.png';
  mkdirSync(join(root, '_expo/static/js/android'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, bundle), 'hermes');
  writeFileSync(join(root, asset), 'asset');
  writeFileSync(
    join(root, 'metadata.json'),
    JSON.stringify({
      bundler: 'metro',
      fileMetadata: { android: { assets: [{ path: asset }], bundle } },
    }),
  );
};

const androidFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'nrb-expo-android-'));
  temporaryRoots.push(root);
  writeAndroidFixture(root);
  return root;
};

describe('Expo export wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  it('verifies the Android artifact after a successful export', () => {
    const outputRoot = androidFixture();
    const spawn = vi.fn(() => {
      writeAndroidFixture(outputRoot);
      return { status: 0 };
    });

    const result = runExpoExports({ outputRoots: { android: outputRoot }, platform: 'android', spawn });

    expect(result).toEqual([
      expect.objectContaining({ bundle: '_expo/static/js/android/entry-test.hbc', platform: 'android' }),
    ]);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['--platform', 'android', '--output-dir', outputRoot]),
      expect.objectContaining({ env: expect.objectContaining({ EXPO_NO_TELEMETRY: '1' }) }),
    );
  });

  it('accepts the SDK 57 index-prefixed Hermes bundle', () => {
    const outputRoot = androidFixture();
    const spawn = vi.fn(() => {
      writeAndroidFixture(outputRoot, 'index-test.hbc');
      return { status: 0 };
    });

    expect(runExpoExports({ outputRoots: { android: outputRoot }, platform: 'android', spawn })).toEqual([
      expect.objectContaining({ bundle: '_expo/static/js/android/index-test.hbc', platform: 'android' }),
    ]);
  });

  it('propagates the Expo exit status before accepting a stale artifact', () => {
    const outputRoot = androidFixture();

    expect(() =>
      runExpoExports({
        outputRoots: { android: outputRoot },
        platform: 'android',
        spawn: () => ({ status: 23 }),
      }),
    ).toThrow(expect.objectContaining({ exitCode: 23, message: 'Expo android export exited with 23.' }));
  });

  it('fails when Expo is terminated by a signal', () => {
    expect(() => runExpoExports({ platform: 'android', spawn: () => ({ signal: 'SIGTERM', status: null }) })).toThrow(
      'Expo android export terminated by SIGTERM.',
    );
  });

  it('fails when a successful process produces no artifact', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'nrb-expo-empty-'));
    temporaryRoots.push(outputRoot);

    expect(() =>
      runExpoExports({ outputRoots: { android: outputRoot }, platform: 'android', spawn: () => ({ status: 0 }) }),
    ).toThrow(/Missing Expo Android metadata/u);
  });
});
