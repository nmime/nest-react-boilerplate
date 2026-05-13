import { base, unicorn } from '@infra-x/code-quality/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  // depend() is temporarily disabled: its JS plugin can crash oxlint with
  // `oxc_allocator fixed_size` in this workspace.
  extends: [base(), unicorn()],
})
