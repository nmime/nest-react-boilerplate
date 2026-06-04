import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UiButton } from "./button";

describe("UiButton shadcn-style rendering", () => {
  it("renders a primary button with the legacy hook and Tailwind tokens", () => {
    const { container } = render(<UiButton>Launch app</UiButton>);
    const element = container.firstElementChild;

    expect(element?.tagName).toBe("BUTTON");
    expect(element?.getAttribute("type")).toBe("button");
    expect(element?.className).toContain("xr-button--primary");
    expect(element?.className).toContain("bg-[linear-gradient");
  });

  it("renders a secondary anchor", () => {
    const { container } = render(
      <UiButton href="/docs" variant="secondary">
        Read docs
      </UiButton>,
    );
    const element = container.firstElementChild;

    expect(element?.tagName).toBe("A");
    expect(element?.getAttribute("href")).toBe("/docs");
    expect(element?.className).toContain("xr-button--secondary");
    expect(element?.className).toContain("border-[var(--xr-color-border)]");
  });

  it("renders a busy button", () => {
    const { container } = render(
      <UiButton isLoading loadingLabel="Saving">
        Save changes
      </UiButton>,
    );
    const element = container.firstElementChild;

    expect(element?.getAttribute("aria-busy")).toBe("true");
    expect(element?.getAttribute("disabled")).toBe("");
    expect(element?.className).toContain("xr-button--loading");
    expect(element?.textContent).toContain("Saving");
  });

  it("renders a disabled secondary anchor", () => {
    const { container } = render(
      <UiButton disabled href="/billing" variant="secondary">
        Billing settings
      </UiButton>,
    );
    const element = container.firstElementChild;

    expect(element?.getAttribute("aria-disabled")).toBe("true");
    expect(element?.getAttribute("tabindex")).toBe("-1");
    expect(element?.className).toContain("xr-button--secondary");
  });
});
