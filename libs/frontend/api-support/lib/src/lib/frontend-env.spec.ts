import { describe, expect, it } from "vitest";
import { getApiBaseUrl, type FrontendEnv } from "./frontend-env";

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
