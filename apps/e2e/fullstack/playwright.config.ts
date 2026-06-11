import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/fullstack", open: "never" }],
    ["junit", { outputFile: "coverage/e2e/fullstack/junit.xml" }],
  ],
  outputDir: "test-results/fullstack",
  use: {
    baseURL:
      process.env.FULLSTACK_BASE_URL ??
      process.env.USER_APP_URL ??
      "http://127.0.0.1:8082",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  globalSetup: "./src/global-setup.ts",
  globalTeardown: "./src/global-teardown.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
