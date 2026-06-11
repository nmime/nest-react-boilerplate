import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ErrorInfo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiErrorBoundary } from "./feedback";

const ThrowingChild = () => {
  throw new Error("Child render failed");
};

const MaybeThrowingChild = ({
  shouldThrow,
}: Readonly<{ shouldThrow: boolean }>) => {
  if (shouldThrow) {
    throw new Error("Resettable child failed");
  }

  return <p>Recovered child</p>;
};

describe("UiErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("announces the default crash fallback as an assertive alert and reports render errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn<(error: Error, errorInfo: ErrorInfo) => void>();

    render(
      <UiErrorBoundary onError={onError}>
        <ThrowingChild />
      </UiErrorBoundary>,
    );

    const fallback = screen.getByRole("alert");

    expect(fallback.getAttribute("aria-live")).toBe("assertive");
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByText(/Try refreshing the page/u)).toBeTruthy();
    expect(onError).toHaveBeenCalledOnce();
    const [error, errorInfo] = onError.mock.calls[0] ?? [];
    expect(error).toEqual(
      expect.objectContaining({ message: "Child render failed" }),
    );
    expect(errorInfo?.componentStack).toEqual(expect.any(String));
  });

  it("supports custom fallbacks and reset-key recovery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReset = vi.fn();

    const { rerender } = render(
      <UiErrorBoundary
        fallback={<div role="alert">Custom fallback</div>}
        onReset={onReset}
        resetKey="failed"
      >
        <MaybeThrowingChild shouldThrow />
      </UiErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Custom fallback");

    rerender(
      <UiErrorBoundary
        fallback={<div role="alert">Custom fallback</div>}
        onReset={onReset}
        resetKey="recovered"
      >
        <MaybeThrowingChild shouldThrow={false} />
      </UiErrorBoundary>,
    );

    await waitFor(() =>
      expect(screen.getByText("Recovered child")).toBeTruthy(),
    );
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
