import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UiButton } from "./button";

describe("UiButton snapshots", () => {
  it("renders a primary button", () => {
    const { container } = render(<UiButton>Launch app</UiButton>);

    expect(container.firstChild).toMatchInlineSnapshot(`
      <button
        class="xr-button xr-button--primary"
        type="button"
      >
        Launch app
      </button>
    `);
  });

  it("renders a secondary anchor", () => {
    const { container } = render(
      <UiButton href="/docs" variant="secondary">
        Read docs
      </UiButton>,
    );

    expect(container.firstChild).toMatchInlineSnapshot(`
      <a
        class="xr-button xr-button--secondary"
        href="/docs"
      >
        Read docs
      </a>
    `);
  });

  it("renders a busy button", () => {
    const { container } = render(
      <UiButton isLoading loadingLabel="Saving">
        Save changes
      </UiButton>,
    );

    expect(container.firstChild).toMatchInlineSnapshot(`
      <button
        aria-busy="true"
        class="xr-button xr-button--primary xr-button--loading"
        disabled=""
        type="button"
      >
        <span
          aria-hidden="true"
          class="xr-button__content"
        >
          Save changes
        </span>
        <span
          class="xr-button__loading-label"
        >
          Saving
        </span>
      </button>
    `);
  });

  it("renders a disabled secondary anchor", () => {
    const { container } = render(
      <UiButton disabled href="/billing" variant="secondary">
        Billing settings
      </UiButton>,
    );

    expect(container.firstChild).toMatchInlineSnapshot(`
      <a
        aria-disabled="true"
        class="xr-button xr-button--secondary"
        href="/billing"
        tabindex="-1"
      >
        Billing settings
      </a>
    `);
  });
});
