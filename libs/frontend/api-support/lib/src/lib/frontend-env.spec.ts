import { describe, expect, it } from "vitest";
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
  getApiBaseUrl,
  getDefaultFrontendBuildApiBaseUrlMode,
  type FrontendBuildEnv,
  type FrontendEnv,
} from "./frontend-env";

const productionEnv = (overrides: FrontendEnv = {}): FrontendEnv => ({
  DEV: false,
  MODE: "production",
  ...overrides,
});

describe("frontend environment API URL resolution", () => {
  it("uses empty API roots only when same-origin mode is explicit", () => {
    expect(
      getApiBaseUrl(
        productionEnv({ VITE_API_BASE_URL_MODE: "same-origin" }),
        "VITE_AUTH_API_BASE_URL",
      ),
    ).toBe("");
  });

  it("normalizes explicit API origins for split-origin frontend builds", () => {
    expect(
      getApiBaseUrl(
        productionEnv({
          VITE_AUTH_API_BASE_URL: " https://auth.example.test/ ",
        }),
        "VITE_AUTH_API_BASE_URL",
      ),
    ).toBe("https://auth.example.test");
  });

  it("fails closed for production without explicit origins or same-origin mode", () => {
    expect(() =>
      getApiBaseUrl(productionEnv(), "VITE_AUTH_API_BASE_URL"),
    ).toThrow(/VITE_AUTH_API_BASE_URL is required/u);
  });
});

describe("frontend build API URL mode defaults", () => {
  it("defaults direct production build targets to same-origin when no API mode or origins are configured", () => {
    const env: FrontendBuildEnv = {};

    expect(
      getDefaultFrontendBuildApiBaseUrlMode(env, "build", "production"),
    ).toBe("same-origin");
    expect(
      applyDefaultFrontendBuildApiBaseUrlMode(env, "build", "production"),
    ).toBe(true);
    expect(env["VITE_API_BASE_URL_MODE"]).toBe("same-origin");
    expect(() =>
      assertRequiredFrontendBuildApiBaseUrls(env, "build", "production"),
    ).not.toThrow();
  });

  it("preserves explicit split-origin mode instead of defaulting", () => {
    const env: FrontendBuildEnv = {
      VITE_API_BASE_URL_MODE: "split-origin",
    };

    expect(
      applyDefaultFrontendBuildApiBaseUrlMode(env, "build", "production"),
    ).toBe(false);
    expect(env["VITE_API_BASE_URL_MODE"]).toBe("split-origin");
  });

  it("preserves explicit API origins and lets them satisfy production builds", () => {
    const env: FrontendBuildEnv = {
      VITE_AUTH_API_BASE_URL: "https://auth.example.com",
      VITE_USER_API_BASE_URL: "https://api.example.com",
      VITE_ADMIN_API_BASE_URL: "https://admin-api.example.com",
    };

    expect(
      applyDefaultFrontendBuildApiBaseUrlMode(env, "build", "production"),
    ).toBe(false);
    expect(env["VITE_API_BASE_URL_MODE"]).toBeUndefined();
    expect(() =>
      assertRequiredFrontendBuildApiBaseUrls(env, "build", "production"),
    ).not.toThrow();
  });

  it("still fails closed for partial explicit API origin configuration", () => {
    const env: FrontendBuildEnv = {
      VITE_AUTH_API_BASE_URL: "https://auth.example.com",
    };

    expect(
      applyDefaultFrontendBuildApiBaseUrlMode(env, "build", "production"),
    ).toBe(false);
    expect(() =>
      assertRequiredFrontendBuildApiBaseUrls(env, "build", "production"),
    ).toThrow(/VITE_USER_API_BASE_URL, VITE_ADMIN_API_BASE_URL/u);
  });
});
