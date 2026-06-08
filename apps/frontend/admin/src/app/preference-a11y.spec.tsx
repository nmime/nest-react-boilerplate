import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const profilePayload = {
  principal: {
    subject: "admin-1",
    roles: ["admin"],
    permissions: ["admin:dashboard:read", "admin:profile:read"],
  },
  profile: {
    id: "admin-1",
    displayName: "Ada Admin",
    email: "admin@example.com",
    locale: "en",
    theme: "dark",
  },
};

describe("admin preferences accessibility", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps language and theme selectors discoverable by accessible names", async () => {
    vi.stubEnv("VITE_ADMIN_API_BASE_URL", "https://admin.example.test");
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : (input as Request).url;
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

    await waitFor(() =>
      expect(screen.getByText("Admin dashboard")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Language")).toBeTruthy();
    expect(screen.getByLabelText("Theme")).toBeTruthy();
  });
});
