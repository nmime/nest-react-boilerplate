import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';

export interface StaticDataEntry<T = unknown> {
  key: string;
  value: T;
}

@Injectable()
export class StaticDataService {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly rootDir: string) {}

  /**
   * Resolve a caller-supplied relative path against the configured root and
   * assert that it stays inside the root. `path.join` does not neutralize `..`
   * segments, so a raw join would allow reads outside the static-data root.
   */
  private resolveWithinRoot(relativePath: string): string {
    const rootResolved = resolve(this.rootDir);
    const resolved = resolve(rootResolved, relativePath);
    if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
      throw new Error(`Refusing to access path outside the static-data root: ${relativePath}`);
    }
    return resolved;
  }

  async getJson<T = unknown>(key: string): Promise<T> {
    // Cache by the resolved absolute path so that distinct string variants of
    // the same file (e.g. `config`, `./config`) collapse to one entry and the
    // cache is bounded by the number of files actually present on disk.
    const filePath = this.resolveWithinRoot(`${key}.json`);
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath) as T;
    }

    const raw = await readFile(filePath, 'utf8');
    const value = JSON.parse(raw) as T;
    this.cache.set(filePath, value);
    return value;
  }

  async listJson<T = unknown>(directory = '.'): Promise<StaticDataEntry<T>[]> {
    const absoluteDirectory = this.resolveWithinRoot(directory);
    const files = await readdir(absoluteDirectory);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));
    return await Promise.all(
      jsonFiles.map(async (file) => {
        const key = join(directory, file.replace(/\.json$/u, ''));
        return {
          key,
          value: await this.getJson<T>(key),
        };
      }),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
