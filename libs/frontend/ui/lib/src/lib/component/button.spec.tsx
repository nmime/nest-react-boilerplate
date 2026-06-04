import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UiButton } from "./button";
import { UiCard } from "./card";
import { UiForm } from "./form";
import { UiTextField } from "./form-field";
import { UiSelect } from "./select";
import { UiSection } from "./section";
import { UiStatCard } from "./stat-card";
import { UiStatusPill } from "./status-pill";
import { UiEmptyState, UiLoading, UiToast } from "./feedback";

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

  it("hardens links that open in a new tab", () => {
    const html = renderToStaticMarkup(
      <UiButton href="https://example.com/docs" rel="nofollow" target="_blank">
        External docs
      </UiButton>,
    );

    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("renders disabled links outside the tab order", () => {
    const html = renderToStaticMarkup(
      <UiButton disabled href="/danger" variant="secondary">
        Dangerous action
      </UiButton>,
    );

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it("renders safe button controls by default", () => {
    const html = renderToStaticMarkup(<UiButton>Confirm</UiButton>);

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("xr-button--primary");
  });

  it("marks loading buttons as busy and disabled", () => {
    const html = renderToStaticMarkup(
      <UiButton isLoading loadingLabel="Saving">
        Save changes
      </UiButton>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("xr-button--loading");
    expect(html).toContain("Saving");
  });

  it("prevents unavailable link actions while forwarding available clicks", () => {
    const unavailableClick = vi.fn();
    const availableClick = vi.fn();

    const { rerender } = render(
      <UiButton disabled href="/reports" onClick={unavailableClick}>
        Reports
      </UiButton>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    expect(unavailableClick).not.toHaveBeenCalled();

    rerender(
      <UiButton href="/reports" onClick={availableClick}>
        Reports
      </UiButton>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    expect(availableClick).toHaveBeenCalledOnce();
  });

  it("honors explicit stat-card accessibility props", () => {
    const html = renderToStaticMarkup(
      <UiStatCard
        aria-label="Custom stat label"
        className="custom-stat"
        detail="Updated every minute"
        label="Latency"
        role="figure"
        value="12ms"
      />,
    );

    expect(html).toContain('aria-label="Custom stat label"');
    expect(html).toContain('class="xr-stat-card custom-stat"');
    expect(html).toContain('role="figure"');
  });

  it("renders card title and body content with a stable label", () => {
    const html = renderToStaticMarkup(
      <UiCard title="Security" titleId="security-card-title">
        Strict validation enabled
      </UiCard>,
    );

    expect(html).toContain("<article");
    expect(html).toContain('aria-labelledby="security-card-title"');
    expect(html).toContain('id="security-card-title"');
    expect(html).toContain("Security");
    expect(html).toContain("Strict validation enabled");
  });

  it("renders card body without an optional title", () => {
    const html = renderToStaticMarkup(<UiCard>Body only</UiCard>);

    expect(html).toContain("Body only");
    expect(html).not.toContain("xr-card__title");
    expect(html).not.toContain("aria-labelledby");
  });

  it("renders sections with and without optional eyebrow copy", () => {
    const withEyebrow = renderToStaticMarkup(
      <UiSection eyebrow="Overview" title="Workspace" titleId="workspace-title">
        Section content
      </UiSection>,
    );
    const withoutEyebrow = renderToStaticMarkup(
      <UiSection title="Workspace">Section content</UiSection>,
    );

    expect(withEyebrow).toContain("Overview");
    expect(withEyebrow).toContain("xr-eyebrow");
    expect(withEyebrow).toContain('aria-labelledby="workspace-title"');
    expect(withoutEyebrow).toContain("Workspace");
    expect(withoutEyebrow).not.toContain("xr-eyebrow");
  });

  it("renders stat cards and status pill tones", () => {
    const stat = renderToStaticMarkup(
      <UiStatCard
        detail="Always available"
        label="Availability"
        value="24/7"
        valueLabel="twenty four seven"
      />,
    );
    const defaultStatus = renderToStaticMarkup(<UiStatusPill label="Ready" />);
    const liveStatus = renderToStaticMarkup(
      <UiStatusPill label="Internal" live="polite" tone="warning" />,
    );

    expect(stat).toContain('role="group"');
    expect(stat).toContain(
      'aria-label="Availability: twenty four seven. Always available"',
    );
    expect(defaultStatus).toContain("xr-status--info");
    expect(defaultStatus).toContain('data-tone="info"');
    expect(liveStatus).toContain("xr-status--warning");
    expect(liveStatus).toContain('aria-live="polite"');
    expect(liveStatus).toContain('role="status"');

    const valueLabelFallback = renderToStaticMarkup(
      <UiStatCard detail="Median" label="Latency" value="12ms" />,
    );

    expect(valueLabelFallback).toContain('aria-label="Latency: 12ms. Median"');
  });

  it("renders feedback primitives", () => {
    const loading = renderToStaticMarkup(<UiLoading label="Loading profile" />);
    const empty = renderToStaticMarkup(
      <UiEmptyState
        description="Create the first item."
        descriptionId="empty-description"
        title="Nothing here yet"
        titleId="empty-title"
      />,
    );
    const staticEmpty = renderToStaticMarkup(
      <UiEmptyState
        aria-live="off"
        description="Static onboarding copy."
        role="region"
        title="Welcome"
      />,
    );
    const toast = renderToStaticMarkup(
      <UiToast message="Saved" tone="success" />,
    );
    const warningToast = renderToStaticMarkup(
      <UiToast message="Sync delayed" tone="warning" />,
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain("Loading profile");
    expect(empty).toContain('aria-labelledby="empty-title"');
    expect(empty).toContain('aria-describedby="empty-description"');
    expect(empty).toContain('role="status"');
    expect(empty).toContain('aria-live="polite"');
    expect(staticEmpty).toContain('role="region"');
    expect(staticEmpty).toContain('aria-live="off"');
    expect(toast).toContain("xr-toast--success");
    expect(toast).toContain('aria-live="polite"');
    expect(warningToast).toContain('role="alert"');
    expect(warningToast).toContain('aria-live="assertive"');
  });

  it("renders accessible text fields with labels and descriptions", () => {
    const html = renderToStaticMarkup(
      <UiTextField
        error="Use a work email"
        hint="We never share this address."
        label="Email address"
        name="email"
        placeholder="name@example.com"
        required
        type="email"
      />,
    );

    expect(html).toContain('class="xr-field__label');
    expect(html).toContain('class="xr-input');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Email address");
    expect(html).toContain("We never share this address.");
    expect(html).toContain("Use a work email");
  });

  it("renders shadcn-style form and Radix select primitives", () => {
    const onValueChange = vi.fn();

    render(
      <UiForm aria-label="Preferences">
        <UiSelect
          aria-label="Language"
          label="Language"
          onValueChange={onValueChange}
          options={[
            { label: "English", value: "en" },
            { label: "Русский", value: "ru" },
          ]}
          value="en"
        />
      </UiForm>,
    );

    expect(screen.getByRole("form", { name: "Preferences" })).toBeDefined();
    const nativeSelect = screen.getByRole("combobox", { name: "Language" });
    expect(nativeSelect).toHaveProperty("value", "en");
    const trigger = document.querySelector(".xr-select-trigger");
    expect(trigger?.className).toContain("xr-select-trigger");
    expect(trigger?.className).toContain("rounded-full");
  });
});
