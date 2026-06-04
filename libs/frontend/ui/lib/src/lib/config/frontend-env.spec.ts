import { describe, expect, it } from "vitest";
import {
  assertRequiredFrontendApiBaseUrls,
  getRequiredApiBaseUrl,
  isLegacyUrlBearerTokenBootstrapAllowed,
  readLegacyUrlBearerToken,
  type FrontendEnv,
} from "./frontend-env";

const productionEnv = (overrides: FrontendEnv = {}): FrontendEnv => ({
  DEV: false,
  MODE: "production",
  PROD: true,
  ...overrides,
});

describe("frontend environment hardening", () => {
  it("requires explicit API base URLs in production unless same-origin mode is explicit", () => {
    expect(() =>
      assertRequiredFrontendApiBaseUrls(
        productionEnv({
          VITE_AUTH_API_BASE_URL: "https://auth.example.com",
          VITE_USER_API_BASE_URL: "https://user.example.com",
        }),
      ),
    ).toThrow(/VITE_ADMIN_API_BASE_URL/u);

    expect(() =>
      assertRequiredFrontendApiBaseUrls(
        productionEnv({ VITE_API_BASE_URL_MODE: "same-origin" }),
      ),
    ).not.toThrow();
  });

  it("normalizes required production API base URLs", () => {
    expect(
      getRequiredApiBaseUrl(
        productionEnv({
          VITE_AUTH_API_BASE_URL: " https://auth.example.com/ ",
        }),
        "VITE_AUTH_API_BASE_URL",
      ),
    ).toBe("https://auth.example.com");
  });

  it("allows test and development same-origin fallbacks without hiding production mistakes", () => {
    expect(
      getRequiredApiBaseUrl(
        { DEV: true, MODE: "development" },
        "VITE_USER_API_BASE_URL",
      ),
    ).toBe("");
    expect(
      getRequiredApiBaseUrl({ MODE: "test" }, "VITE_ADMIN_API_BASE_URL"),
    ).toBe("");
    expect(() =>
      getRequiredApiBaseUrl(productionEnv(), "VITE_USER_API_BASE_URL"),
    ).toThrow(/VITE_USER_API_BASE_URL is required/u);
  });

  it("blocks legacy URL bearer-token bootstrap outside non-production modes", () => {
    expect(isLegacyUrlBearerTokenBootstrapAllowed({ MODE: "test" })).toBe(true);
    expect(
      readLegacyUrlBearerToken(
        { MODE: "test" },
        "https://app.test/?token=dev-token",
      ),
    ).toBe("dev-token");
    expect(
      readLegacyUrlBearerToken(
        productionEnv({ VITE_API_BASE_URL_MODE: "same-origin" }),
        "https://app.example.com/?token=prod-token&admin_token=admin-token",
      ),
    ).toBeNull();
  });
});
