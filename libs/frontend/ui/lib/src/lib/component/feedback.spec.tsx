import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("renders the translated accessible fallback and reports render errors", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const onError = vi.fn();

    render(
      <UiErrorBoundary onError={onError}>
        <ThrowingChild />
      </UiErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByText(/Try refreshing the page/u)).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
    consoleError.mockRestore();
  });

  it("supports custom fallbacks and reset keys", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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

    expect(screen.getByRole("alert")).toBeTruthy();

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
    consoleError.mockRestore();
  });
});
