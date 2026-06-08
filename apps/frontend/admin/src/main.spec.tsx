import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const domMocks = vi.hoisted(() => {
  let renderedTree: unknown;
  const renderMock = vi.fn((node: unknown) => {
    renderedTree = node;
  });
  const createRootMock = vi.fn(() => ({ render: renderMock }));

  return {
    clear: () => {
      renderedTree = undefined;
    },
    createRootMock,
    getRenderedTree: () => renderedTree,
    renderMock,
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: domMocks.createRootMock,
}));

vi.mock("./App", () => ({
  default: function ThrowingAdminApp() {
    throw new Error("Admin app crashed");
  },
}));

describe("admin app root", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    domMocks.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("wraps the root render in the shared assertive error boundary fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    document.body.innerHTML = '<div id="root"></div>';

    await import("./main");

    expect(domMocks.createRootMock).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(domMocks.renderMock).toHaveBeenCalledTimes(1);

    render(<>{domMocks.getRenderedTree() as ReactNode}</>);

    const fallback = screen.getByRole("alert");

    expect(fallback.getAttribute("aria-live")).toBe("assertive");
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByText(/Try refreshing the page/u)).toBeTruthy();
  });
});
