import type { BrowserContextOptions } from "@playwright/test";

/**
 * Axe is injected by the test harness after the application has loaded.
 * Bypass CSP only in this isolated audit context so production `script-src`
 * remains strict while the external accessibility engine can execute.
 */
export function accessibilityContextOptions(
  profile: BrowserContextOptions | undefined,
): BrowserContextOptions {
  return {
    ...profile,
    bypassCSP: true,
  };
}
