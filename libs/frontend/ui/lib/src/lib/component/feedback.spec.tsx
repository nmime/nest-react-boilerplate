import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UiErrorBoundary } from "./feedback";

const ThrowingChild = () => {
  throw new Error("boom");
};

describe("UiErrorBoundary", () => {
  it("announces the default crash fallback as an assertive alert", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      render(
        <UiErrorBoundary>
          <ThrowingChild />
        </UiErrorBoundary>,
      );
    } finally {
      consoleError.mockRestore();
    }

    const fallback = screen.getByRole("alert");

    expect(fallback.getAttribute("aria-live")).toBe("assertive");
    expect(fallback.textContent).toContain("Something went wrong");
    expect(fallback.textContent).toContain("Try refreshing the page.");
  });
});
