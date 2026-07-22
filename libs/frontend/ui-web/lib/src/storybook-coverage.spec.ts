import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const exportedModules = (indexSource: string) =>
  [...indexSource.matchAll(/export \* from ['"]\.\/([^'"]+)['"]/g)].map((match) => match[1]);

describe('shared UI Storybook coverage', () => {
  it('keeps every public component and layout represented by a story', () => {
    const publicModules = [
      ...exportedModules(readSource('./component/index.ts')),
      ...exportedModules(readSource('./layout/index.ts')),
    ];
    const storySources = [
      readSource('./component/admin-primitives.stories.tsx'),
      readSource('./component/button.stories.tsx'),
      readSource('./component/feedback-display.stories.tsx'),
      readSource('./component/form-controls.stories.tsx'),
      readSource('./layout/shells.stories.tsx'),
    ].join('\n');

    for (const moduleName of publicModules) {
      const componentImport = new RegExp(`from ['"](?:\\.\\./component|\\.)/${moduleName}['"]`);
      expect(storySources, `${moduleName} is not represented in Storybook`).toMatch(componentImport);
    }
  });
});
