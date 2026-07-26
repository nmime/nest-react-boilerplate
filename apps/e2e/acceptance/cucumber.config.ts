import type { IConfiguration } from '@cucumber/cucumber';

export default {
  paths: ['apps/e2e/acceptance/features/**/*.feature'],
  import: ['apps/e2e/acceptance/src/**/*.ts'],
  parallel: 1,
  retry: 0,
  format: [
    'progress',
    'message:test-results/cucumber/messages.ndjson',
    'html:cucumber-report/index.html',
    'junit:test-results/cucumber/junit.xml',
  ],
} satisfies Partial<IConfiguration>;
