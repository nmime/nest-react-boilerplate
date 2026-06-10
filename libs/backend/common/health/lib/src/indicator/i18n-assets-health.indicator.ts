import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { HealthIndicator, HealthIndicatorResult } from "../dto";

export interface I18nAssetsHealthIndicatorOptions {
  name?: string;
  required?: boolean;
  rootPath?: string;
  locales?: readonly string[];
}

export class I18nAssetsHealthIndicator implements HealthIndicator {
  readonly name: string;
  readonly required: boolean;
  private readonly rootPath: string | undefined;
  private readonly locales: readonly string[];

  constructor(options: I18nAssetsHealthIndicatorOptions = {}) {
    this.name = options.name ?? "i18n";
    this.required = options.required ?? false;
    this.rootPath = options.rootPath;
    this.locales = options.locales ?? [];
  }

  check(): HealthIndicatorResult {
    if (!this.rootPath) {
      return {
        name: this.name,
        status: "skipped",
        required: false,
        details: { reason: "no i18n assets path configured" },
      };
    }

    if (!existsSync(this.rootPath) || !statSync(this.rootPath).isDirectory()) {
      return {
        name: this.name,
        status: this.required ? "error" : "degraded",
        required: this.required,
        details: {
          configured: true,
          rootExists: false,
          missingLocales: this.locales,
        },
      };
    }

    const availableLocales = listDirectoryNames(this.rootPath);
    const missingLocales = this.locales.filter(
      (locale) => !availableLocales.includes(locale),
    );

    return {
      name: this.name,
      status: missingLocales.length > 0 ? "degraded" : "ok",
      required: this.required,
      details: {
        configured: true,
        rootExists: true,
        localeCount: availableLocales.length,
        checkedLocales: this.locales,
        missingLocales,
      },
    };
  }
}

function listDirectoryNames(rootPath: string): string[] {
  return readdirSync(rootPath).filter((entry) => {
    try {
      return statSync(join(rootPath, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}
