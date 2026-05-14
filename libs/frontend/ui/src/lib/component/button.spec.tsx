import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiButton } from "./button";
import { UiCard } from "./card";

describe("shared UI components", () => {
  it("renders links with href and variant class", () => {
    const html = renderToStaticMarkup(
      <UiButton href="/dashboard" variant="secondary">
        Open dashboard
      </UiButton>,
    );

    expect(html).toContain("<a");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("xr-button--secondary");
    expect(html).toContain("Open dashboard");
  });

  it("renders safe button controls by default", () => {
    const html = renderToStaticMarkup(<UiButton>Confirm</UiButton>);

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("xr-button--primary");
  });

  it("renders card title and body content", () => {
    const html = renderToStaticMarkup(
      <UiCard title="Security">Strict validation enabled</UiCard>,
    );

    expect(html).toContain("<article");
    expect(html).toContain("<h3");
    expect(html).toContain("Security");
    expect(html).toContain("Strict validation enabled");
  });
});
