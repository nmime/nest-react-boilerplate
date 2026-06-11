import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommonFormatConfigService, CommonFormatService } from "./index";

describe("CommonFormatService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats numbers and currencies", () => {
    const service = new CommonFormatService("en-US");
    expect(service.number(1234.5)).toBe("1,234.5");
    expect(service.currency(12, "USD")).toBe("$12.00");
  });

  it("reads the default locale through createConfig", () => {
    expect(new CommonFormatConfigService().defaultLocale).toBe("en-US");

    vi.stubEnv("DEFAULT_LOCALE", "nl-NL");

    expect(new CommonFormatConfigService().defaultLocale).toBe("nl-NL");
    expect(new CommonFormatConfigService("fr-FR").defaultLocale).toBe("fr-FR");
  });
});
