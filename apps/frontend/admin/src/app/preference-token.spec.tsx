import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const profilePayload = {
  principal: {
    subject: "admin-1",
    roles: ["admin"],
    permissions: [
      "admin:dashboard:read",
      "admin:profile:read",
      "admin:users:read",
    ],
  },
  profile: {
    id: "admin-1",
    displayName: "Ada Admin",
    email: "admin@example.com",
    locale: "en",
    theme: "dark",
  },
};

describe("admin preference auth token handling", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubEnv("VITE_ADMIN_API_BASE_URL", "https://admin.example.test");
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth.example.test");
    window.history.pushState(null, "", "/admin?token=legacy-token");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.pushState(null, "", "/");
  });

  it("reuses the initial URL bearer token for preference updates after scrubbing the URL", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const request = input as Request;
        requests.push(request);
        const url = typeof input === "string" ? input : request.url;
        if (url.includes("/auth/me/preferences")) {
          return Promise.resolve(
            new Response(JSON.stringify({ theme: "light" }), {
              headers: { "Content-Type": "application/json" },
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes("/auth/me")
                ? { data: { principal: profilePayload.principal } }
                : profilePayload,
            ),
            { headers: { "Content-Type": "application/json" }, status: 200 },
          ),
        );
      }),
    );

    render(<App />);

    expect(await screen.findByText("Admin dashboard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(await screen.findByRole("option", { name: "Light" }));

    await waitFor(() =>
      expect(requests.some((request) => request.url.includes("preferences"))).toBe(
        true,
      ),
    );
    const preferenceRequest = requests.find((request) =>
      request.url.includes("preferences"),
    );
    expect(preferenceRequest?.headers.get("authorization")).toBe(
      "Bearer legacy-token",
    );
  });
});
