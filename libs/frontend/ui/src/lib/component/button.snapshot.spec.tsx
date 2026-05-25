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
});
