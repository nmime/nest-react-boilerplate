// @requirements REQ-FRONTEND-NATIVE-006
// Evidence for: REQ-FRONTEND-NATIVE-006
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function collectTestModules(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectTestModules(path);
    }
    return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(entry.name) ? [path] : [];
  });
}

describe('Expo Router source boundary', () => {
  it('keeps test modules outside the route tree consumed by Metro', () => {
    expect(collectTestModules(join(import.meta.dirname, 'app'))).toEqual([]);
  });
});
