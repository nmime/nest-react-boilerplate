import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiCopyableText, UiNotification } from "./notification";

describe("UiNotification branch coverage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("omits the title element and honors an explicit role", () => {
    render(<UiNotification message="Body only" role="note" />);

    const region = screen.getByRole("note");
    expect(region.textContent).toContain("Body only");
    expect(region.querySelector("strong")).toBeNull();
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("no-ops copy when the clipboard boundary is unavailable", () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<UiCopyableText value="usr_999" />);

    expect(() =>
      fireEvent.click(
        screen.getByRole("button", { name: "Copy value: usr_999" }),
      ),
    ).not.toThrow();
  });

  it("copies through the clipboard boundary when it is present", () => {
    const writeText = vi.fn();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<UiCopyableText copiedLabel="Copied!" label="Copy id" value="k1" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy id: k1" }));

    expect(writeText).toHaveBeenCalledWith("k1");
  });
});
