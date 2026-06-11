import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { I18nAssetsHealthIndicator } from "./i18n-assets-health.indicator";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("I18nAssetsHealthIndicator", () => {
  it("skips when no root path is configured", () => {
    expect(new I18nAssetsHealthIndicator().check()).toEqual({
      name: "i18n",
      status: "skipped",
      required: false,
      details: { reason: "no i18n assets path configured" },
    });
  });

  it("checks configured locale directories without importing app internals", () => {
    const root = mkdtempSync(join(tmpdir(), "health-i18n-"));
    tempRoots.push(root);
    mkdirSync(join(root, "en"));

    expect(
      new I18nAssetsHealthIndicator({
        rootPath: root,
        locales: ["en", "fr"],
      }).check(),
    ).toEqual({
      name: "i18n",
      status: "degraded",
      required: false,
      details: {
        configured: true,
        rootExists: true,
        localeCount: 1,
        checkedLocales: ["en", "fr"],
        missingLocales: ["fr"],
      },
    });
  });
});
