import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiButton } from "./button";
import { UiCard } from "./card";
import { UiSection } from "./section";
import { UiStatCard } from "./stat-card";
import { UiStatusPill } from "./status-pill";

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

  it("renders card body without an optional title", () => {
    const html = renderToStaticMarkup(<UiCard>Body only</UiCard>);

    expect(html).toContain("Body only");
    expect(html).not.toContain("xr-card__title");
  });

  it("renders sections with and without optional eyebrow copy", () => {
    const withEyebrow = renderToStaticMarkup(
      <UiSection eyebrow="Overview" title="Workspace">
        Section content
      </UiSection>,
    );
    const withoutEyebrow = renderToStaticMarkup(
      <UiSection title="Workspace">Section content</UiSection>,
    );

    expect(withEyebrow).toContain("Overview");
    expect(withEyebrow).toContain("xr-eyebrow");
    expect(withoutEyebrow).toContain("Workspace");
    expect(withoutEyebrow).not.toContain("xr-eyebrow");
  });

  it("renders stat cards and status pill tones", () => {
    const stat = renderToStaticMarkup(
      <UiStatCard
        detail="Always available"
        label="Availability"
        value="24/7"
      />,
    );
    const defaultStatus = renderToStaticMarkup(<UiStatusPill label="Ready" />);
    const warningStatus = renderToStaticMarkup(
      <UiStatusPill label="Internal" tone="warning" />,
    );

    expect(stat).toContain("Availability");
    expect(stat).toContain("24/7");
    expect(stat).toContain("Always available");
    expect(defaultStatus).toContain("xr-status--info");
    expect(warningStatus).toContain("xr-status--warning");
  });
});
