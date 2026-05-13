import { base, node, unicorn } from '@infra-x/code-quality/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  // depend() and drizzle() are temporarily disabled: their JS plugins can crash
  // oxlint with `oxc_allocator fixed_size` in this workspace.
  extends: [base(), unicorn(), node()],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      rules: {
        'typescript/no-explicit-any': 'off',
        // Scripts intentionally reach into src/ via relative paths.
        'import/no-relative-parent-imports': 'off',
      },
    },
    {
      // Drizzle Kit does not resolve tsconfig path aliases for schema files.
      // Schemas must reference each other via relative paths.
      files: ['src/schemas/**/*.ts'],
      rules: {
        'import/no-relative-parent-imports': 'off',
      },
    },
  ],
})
