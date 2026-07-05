import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiApiRuntimeOverlay } from "./api-runtime-overlay";

describe("UiApiRuntimeOverlay", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("contains runtime notification content in named landmarks and live regions", () => {
    const html = renderToStaticMarkup(
      <UiApiRuntimeOverlay
        status="online"
        toasts={[
          {
            category: "info",
            id: "api-sync",
            message: "Route data refreshed",
            title: "API sync",
          },
        ]}
      />,
    );

    expect(html).toContain("<aside");
    expect(html).toContain('aria-label="API runtime status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="API notifications"');
    expect(html).toContain("API sync: Route data refreshed");
  });

  it("shows the offline banner and dismisses toasts across every tone", () => {
    const onDismissToast = vi.fn();

    render(
      <UiApiRuntimeOverlay
        onDismissToast={onDismissToast}
        status="offline"
        toasts={[
          { category: "success", id: "s", title: "Saved" },
          { category: "warning", id: "w", message: "Disk low", title: "Warn" },
          { category: "error", id: "e", title: "Failed" },
          { category: "info", id: "i", title: "Note" },
        ]}
      />,
    );

    expect(screen.getByText("Offline mode")).toBeTruthy();
    expect(
      screen.getByText(
        "You are offline. We will keep this route mounted while the connection recovers.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Saved" }));
    expect(onDismissToast).toHaveBeenCalledWith("s");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Failed" }));
    expect(onDismissToast).toHaveBeenLastCalledWith("e");
  });

  it("shows the server-error banner and a redirect-aware sign-in link", () => {
    render(
      <UiApiRuntimeOverlay
        authRequired
        copy={{ serverErrorTitle: "Service down" }}
        redirectTo="/login"
        status="server-error"
      />,
    );

    expect(screen.getByText("Service down")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Continue to sign in" })
        .getAttribute("href"),
    ).toBe("/login");
  });

  it("prefers a provided auth action over the default sign-in link", () => {
    render(
      <UiApiRuntimeOverlay
        authAction={<button type="button">Custom sign in</button>}
        authRequired
      />,
    );

    expect(screen.getByRole("button", { name: "Custom sign in" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Continue to sign in" }),
    ).toBeNull();
  });
});
