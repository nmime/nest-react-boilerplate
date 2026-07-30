// @requirements REQ-FRONTEND-SHELL-004
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Domain logic (models + data-access) for the user app was moved into shared,
// platform-neutral libs under libs/frontend/feature/user/* so the native mobile
// app can consume the same behavior. This guard keeps it that way: FSD feature
// and entity slices in this app may only hold `ui/` (+ the public `index.ts`
// re-export); a `model/` or `api/` directory here means logic that belongs in a
// shared lib has crept back into the app.
const srcRoot = resolve(import.meta.dirname, '..');
const sharedOnlyLayers = ['features', 'entities'];
const forbiddenSliceDirs = ['model', 'api'];

const collectAppLocalLogic = (): string[] => {
  const violations: string[] = [];
  for (const layer of sharedOnlyLayers) {
    const layerRoot = join(srcRoot, layer);
    if (!existsSync(layerRoot)) {
      continue;
    }
    for (const slice of readdirSync(layerRoot, { withFileTypes: true })) {
      if (!slice.isDirectory()) {
        continue;
      }
      for (const forbidden of forbiddenSliceDirs) {
        if (existsSync(join(layerRoot, slice.name, forbidden))) {
          violations.push(`${layer}/${slice.name}/${forbidden}`);
        }
      }
    }
  }
  return violations;
};

describe('shared feature-logic boundary', () => {
  it('keeps user feature/entity domain logic in shared libs, not app-local model/api slices', () => {
    expect(collectAppLocalLogic()).toEqual([]);
  });
});
