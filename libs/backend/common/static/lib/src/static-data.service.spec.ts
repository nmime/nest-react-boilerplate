import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaticDataService } from './static-data.service';

describe('StaticDataService', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'static-data-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('reads and parses a JSON file', async () => {
    await writeFile(join(rootDir, 'config.json'), JSON.stringify({ enabled: true }));
    const service = new StaticDataService(rootDir);

    await expect(service.getJson('config')).resolves.toEqual({ enabled: true });
  });

  it('caches the parsed value and does not re-read the file', async () => {
    const filePath = join(rootDir, 'cached.json');
    await writeFile(filePath, JSON.stringify({ value: 1 }));
    const service = new StaticDataService(rootDir);

    const first = await service.getJson<{ value: number }>('cached');
    // Mutating the file should not affect the cached result.
    await writeFile(filePath, JSON.stringify({ value: 999 }));
    const second = await service.getJson<{ value: number }>('cached');

    expect(first).toEqual({ value: 1 });
    expect(second).toBe(first);
  });

  it('re-reads after the cache is cleared', async () => {
    const filePath = join(rootDir, 'cached.json');
    await writeFile(filePath, JSON.stringify({ value: 1 }));
    const service = new StaticDataService(rootDir);

    await service.getJson('cached');
    await writeFile(filePath, JSON.stringify({ value: 2 }));
    service.clearCache();

    await expect(service.getJson('cached')).resolves.toEqual({ value: 2 });
  });

  it('lists only JSON files in the root directory', async () => {
    await writeFile(join(rootDir, 'a.json'), JSON.stringify({ n: 'a' }));
    await writeFile(join(rootDir, 'b.json'), JSON.stringify({ n: 'b' }));
    await writeFile(join(rootDir, 'notes.txt'), 'ignored');
    const service = new StaticDataService(rootDir);

    const entries = await service.listJson<{ n: string }>();

    expect(entries.map((entry) => entry.key).sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b']);
    expect(entries.find((entry) => entry.key === 'a')?.value).toEqual({
      n: 'a',
    });
  });

  it('lists JSON files within a nested directory and prefixes their keys', async () => {
    await mkdir(join(rootDir, 'coins'));
    await writeFile(join(rootDir, 'coins', 'btc.json'), JSON.stringify({ symbol: 'BTC' }));
    const service = new StaticDataService(rootDir);

    const entries = await service.listJson<{ symbol: string }>('coins');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.key).toBe(join('coins', 'btc'));
    expect(entries[0]?.value).toEqual({ symbol: 'BTC' });
  });

  it('rejects when a requested file is missing', async () => {
    const service = new StaticDataService(rootDir);

    await expect(service.getJson('missing')).rejects.toThrow();
  });

  it('propagates JSON parse errors', async () => {
    await writeFile(join(rootDir, 'broken.json'), '{ not valid json');
    const service = new StaticDataService(rootDir);

    await expect(service.getJson('broken')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects getJson keys that traverse outside the root', async () => {
    // Create a JSON file one level above the root that the traversal would target.
    const outsideDir = await mkdtemp(join(tmpdir(), 'static-data-outside-'));
    try {
      await writeFile(join(outsideDir, 'secret.json'), JSON.stringify({ secret: true }));
      const nestedRoot = join(rootDir, 'nested');
      await mkdir(nestedRoot);
      const service = new StaticDataService(nestedRoot);

      // ../../<outsideDir>/secret would escape nestedRoot without containment.
      await expect(service.getJson(join('..', '..', outsideDir, 'secret'))).rejects.toThrow(
        /outside the static-data root/u,
      );
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects listJson directories that traverse outside the root', async () => {
    const nestedRoot = join(rootDir, 'nested');
    await mkdir(nestedRoot);
    const service = new StaticDataService(nestedRoot);

    await expect(service.listJson(join('..', '..'))).rejects.toThrow(/outside the static-data root/u);
  });

  it('collapses distinct string variants of the same key to a single cache entry', async () => {
    const filePath = join(rootDir, 'shared.json');
    await writeFile(filePath, JSON.stringify({ value: 1 }));
    const service = new StaticDataService(rootDir);

    const first = await service.getJson<{ value: number }>('shared');
    // Mutating the file must not surface through a variant path if caching by
    // resolved path is working; both reads should return the same cached object.
    await writeFile(filePath, JSON.stringify({ value: 999 }));
    const second = await service.getJson<{ value: number }>(join('.', 'shared'));

    expect(second).toBe(first);
    expect(second).toEqual({ value: 1 });
  });
});
