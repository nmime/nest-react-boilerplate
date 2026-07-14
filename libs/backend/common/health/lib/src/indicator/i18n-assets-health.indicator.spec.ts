import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nAssetsHealthIndicator } from './i18n-assets-health.indicator';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('I18nAssetsHealthIndicator', () => {
  it('skips when no root path is configured', () => {
    expect(new I18nAssetsHealthIndicator().check()).toEqual({
      name: 'i18n',
      status: 'skipped',
      required: false,
      details: { reason: 'no i18n assets path configured' },
    });
  });

  it('checks configured locale directories without importing app internals', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-i18n-'));
    tempRoots.push(root);
    mkdirSync(join(root, 'en'));

    expect(
      new I18nAssetsHealthIndicator({
        rootPath: root,
        locales: ['en', 'fr'],
      }).check(),
    ).toEqual({
      name: 'i18n',
      status: 'degraded',
      required: false,
      details: {
        configured: true,
        rootExists: true,
        localeCount: 1,
        checkedLocales: ['en', 'fr'],
        missingLocales: ['fr'],
      },
    });
  });

  it('reports ok when every configured locale directory exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-i18n-'));
    tempRoots.push(root);
    mkdirSync(join(root, 'en'));
    mkdirSync(join(root, 'fr'));

    expect(
      new I18nAssetsHealthIndicator({
        rootPath: root,
        locales: ['en', 'fr'],
      }).check(),
    ).toEqual({
      name: 'i18n',
      status: 'ok',
      required: false,
      details: {
        configured: true,
        rootExists: true,
        localeCount: 2,
        checkedLocales: ['en', 'fr'],
        missingLocales: [],
      },
    });
  });

  it('ignores non-directory entries while listing available locales', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-i18n-'));
    tempRoots.push(root);
    mkdirSync(join(root, 'en'));
    writeFileSync(join(root, 'readme.txt'), 'not a locale directory');
    // A dangling symlink surfaces from readdir but statSync throws when the
    // target is missing, exercising the defensive catch in listDirectoryNames.
    symlinkSync(join(root, 'missing-target'), join(root, 'broken-link'));

    expect(
      new I18nAssetsHealthIndicator({
        rootPath: root,
        locales: ['en'],
      }).check(),
    ).toEqual({
      name: 'i18n',
      status: 'ok',
      required: false,
      details: {
        configured: true,
        rootExists: true,
        localeCount: 1,
        checkedLocales: ['en'],
        missingLocales: [],
      },
    });
  });

  it('degrades an optional check when the configured root is missing', () => {
    const root = join(tmpdir(), 'health-i18n-does-not-exist-optional');

    expect(
      new I18nAssetsHealthIndicator({
        rootPath: root,
        locales: ['en', 'fr'],
      }).check(),
    ).toEqual({
      name: 'i18n',
      status: 'degraded',
      required: false,
      details: {
        configured: true,
        rootExists: false,
        missingLocales: ['en', 'fr'],
      },
    });
  });

  it('errors a required check when the configured root is not a directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-i18n-'));
    tempRoots.push(root);
    const filePath = join(root, 'catalog.json');
    writeFileSync(filePath, '{}');

    expect(
      new I18nAssetsHealthIndicator({
        name: 'translations',
        required: true,
        rootPath: filePath,
        locales: ['en'],
      }).check(),
    ).toEqual({
      name: 'translations',
      status: 'error',
      required: true,
      details: {
        configured: true,
        rootExists: false,
        missingLocales: ['en'],
      },
    });
  });
});
