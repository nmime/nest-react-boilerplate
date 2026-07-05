import type { ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import type { IntlContextValue } from "../i18n-context";
import { IntlLocale } from "./intl-locale";

type ParamFactory = (
  data: unknown,
  context: ExecutionContext,
) => IntlContextValue;

type IntlLocaleRequest = {
  locale?: string;
  headers?: Record<string, string | string[] | undefined>;
};

function getParamFactory(): ParamFactory {
  class Probe {
    handle(@IntlLocale() locale: IntlContextValue): IntlContextValue {
      return locale;
    }
  }

  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Probe,
    "handle",
  ) as Record<string, { factory: ParamFactory }>;

  const key = Object.keys(args)[0];
  if (key === undefined) {
    throw new Error("IntlLocale did not register any route argument metadata.");
  }
  const entry = args[key];
  if (!entry) {
    throw new Error("IntlLocale metadata entry is missing.");
  }
  return entry.factory;
}

function contextFor(request: IntlLocaleRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T>(): T => request as T,
    }),
  } as unknown as ExecutionContext;
}

describe("IntlLocale", () => {
  const factory = getParamFactory();

  it("prefers an explicit request locale over headers", () => {
    expect(
      factory(undefined, contextFor({ locale: "ru-RU", headers: {} })),
    ).toEqual({ locale: "ru-RU", fallbackLocale: "en" });
  });

  it("derives the locale from a string accept-language header", () => {
    expect(
      factory(
        undefined,
        contextFor({ headers: { "accept-language": "fr-FR,en;q=0.8" } }),
      ),
    ).toEqual({ locale: "fr-FR", fallbackLocale: "en" });
  });

  it("derives the locale from the first array accept-language header value", () => {
    expect(
      factory(
        undefined,
        contextFor({ headers: { "accept-language": ["de-DE", "en"] } }),
      ),
    ).toEqual({ locale: "de-DE", fallbackLocale: "en" });
  });

  it("falls back to the default locale when nothing is provided", () => {
    expect(factory(undefined, contextFor({}))).toEqual({
      locale: "en",
      fallbackLocale: "en",
    });
  });
});
