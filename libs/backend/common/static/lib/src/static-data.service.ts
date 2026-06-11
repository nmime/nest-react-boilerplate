import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";

export interface StaticDataEntry<T = unknown> {
  key: string;
  value: T;
}

@Injectable()
export class StaticDataService {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly rootDir: string) {}

  async getJson<T = unknown>(key: string): Promise<T> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const raw = await readFile(join(this.rootDir, `${key}.json`), "utf8");
    const value = JSON.parse(raw) as T;
    this.cache.set(key, value);
    return value;
  }

  async listJson<T = unknown>(directory = "."): Promise<StaticDataEntry<T>[]> {
    const absoluteDirectory = join(this.rootDir, directory);
    const files = await readdir(absoluteDirectory);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    return await Promise.all(
      jsonFiles.map(async (file) => {
        const key = join(directory, file.replace(/\.json$/u, ""));
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
