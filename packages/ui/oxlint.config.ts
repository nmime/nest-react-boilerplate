import { base, react, unicorn } from '@infra-x/code-quality/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  // Sources here are vendored from shadcn cli; not subject to project lint rules.
  // depend() is temporarily disabled: its JS plugin can crash oxlint with
  // `oxc_allocator fixed_size` in this workspace.
  ignorePatterns: ['src/**'],
  extends: [base(), unicorn(), react()],
})
