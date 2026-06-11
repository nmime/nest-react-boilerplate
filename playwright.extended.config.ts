import { defineConfig, devices } from "@playwright/test";

const manageStack = !process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_MANAGE_STACK !== "0";

export default defineConfig({
  testDir: "apps/e2e/fullstack/src",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/extended", open: "never" }],
    ["junit", { outputFile: "coverage/e2e/extended/junit.xml" }],
  ],
  outputDir: "test-results/extended-e2e",
  globalSetup: manageStack ? "./apps/e2e/fullstack/src/global-setup.ts" : undefined,
  globalTeardown: manageStack ? "./apps/e2e/fullstack/src/global-teardown.ts" : undefined,
  grepInvert: process.env.PLAYWRIGHT_INCLUDE_QUARANTINED === "1" ? undefined : /@quarantine/,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8082",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
});
