import { describe, expect, it, vi } from "vitest";
import {
  createDomainTranslationKey,
  createDomainTranslator,
} from "./domain-namespace";

describe("domain namespace translation bridge", () => {
  it("builds target-compatible flat translation keys for domain namespaces", () => {
    expect(createDomainTranslationKey("domain.billing", "deposit.title")).toBe(
      "domain.billing.deposit.title",
    );
  });

  it("adapts a root translator without introducing i18next coupling", () => {
    const translate = vi.fn((key: string) => `copy:${key}`);
    const domainT = createDomainTranslator(translate, "domain.exchange");

    expect(domainT("trade.submit", { asset: "TON" })).toBe(
      "copy:domain.exchange.trade.submit",
    );
    expect(translate).toHaveBeenCalledWith("domain.exchange.trade.submit", {
      asset: "TON",
    });
  });
});
