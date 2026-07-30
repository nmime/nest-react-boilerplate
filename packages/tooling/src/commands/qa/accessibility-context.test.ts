// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessibilityContextOptions } from "./accessibility-context.ts";

describe("accessibilityContextOptions", () => {
  it("preserves the selected device profile and bypasses CSP only for the audit context", () => {
    assert.deepEqual(
      accessibilityContextOptions({
        isMobile: true,
        viewport: { width: 412, height: 915 },
      }),
      {
        bypassCSP: true,
        isMobile: true,
        viewport: { width: 412, height: 915 },
      },
    );
  });

  it("creates a valid audit context when an optional Playwright profile is unavailable", () => {
    assert.deepEqual(accessibilityContextOptions(undefined), {
      bypassCSP: true,
    });
  });
});
