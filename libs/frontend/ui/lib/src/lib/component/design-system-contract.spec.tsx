import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProductShell,
  UiAlert,
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmDialog,
  UiDataTable,
  UiDialog,
  UiEmptyState,
  UiForm,
  UiInput,
  UiLoading,
  UiNotification,
  UiPagination,
  UiSelect,
  UiStatCard,
  UiStatusPill,
  UiStatusTag,
  UiSwitch,
  UiTabs,
  UiTextarea,
  UiTextField,
  UiToast,
} from "../../index";

describe("public @app/frontend/ui shadcn design-system contract", () => {
  it("keeps the exported Ui* API surface available from the public alias", () => {
    for (const component of [
      ProductShell,
      UiAlert,
      UiButton,
      UiCard,
      UiCheckbox,
      UiConfirmDialog,
      UiDataTable,
      UiDialog,
      UiEmptyState,
      UiForm,
      UiInput,
      UiLoading,
      UiNotification,
      UiPagination,
      UiSelect,
      UiStatCard,
      UiStatusPill,
      UiStatusTag,
      UiSwitch,
      UiTabs,
      UiTextarea,
      UiTextField,
      UiToast,
    ]) {
      expect(component).toBeDefined();
    }
  });

  it("maps legacy UiButton props onto polished shadcn-style states", () => {
    const primary = renderToStaticMarkup(<UiButton>Save</UiButton>);
    const secondary = renderToStaticMarkup(
      <UiButton href="/settings" variant="secondary">
        Settings
      </UiButton>,
    );
    const busy = renderToStaticMarkup(
      <UiButton isLoading loadingLabel="Saving">
        Save
      </UiButton>,
    );

    expect(primary).toContain("xr-button--primary");
    expect(primary).toContain("rounded-[var(--xr-radius-md)]");
    expect(primary).toContain("focus-visible:ring-ring/25");
    expect(secondary).toContain("xr-button--secondary");
    expect(secondary).toContain("hover:bg-accent");
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain("xr-button--loading");
  });

  it("renders form controls with semantic shadcn token classes and a11y wiring", () => {
    const html = renderToStaticMarkup(
      <UiForm aria-label="Account form">
        <UiTextField
          error="Required"
          hint="Use your work address."
          label="Email"
          name="email"
        />
        <UiTextarea aria-label="Notes" />
      </UiForm>,
    );

    expect(html).toContain("xr-form");
    expect(html).toContain("xr-input");
    expect(html).toContain("border-input");
    expect(html).toContain("focus-visible:ring-ring/25");
    expect(html).toContain("xr-textarea");
    expect(html).toContain("aria-describedby");
    expect(html).toContain('aria-invalid="true"');
  });

  it("keeps data, feedback, overlay, and navigation primitives on stable class hooks", () => {
    render(
      <>
        <UiCard title="Metrics">
          <UiStatCard detail="Last hour" label="Requests" value="42" />
        </UiCard>
        <UiAlert tone="success">Synced</UiAlert>
        <UiNotification message="Invite sent" title="Done" tone="success" />
        <UiEmptyState description="No rows" title="Empty" />
        <UiToast message="Saved" tone="success" />
        <UiDataTable
          aria-label="Rows"
          columns={[{ id: "name", header: "Name", render: (row) => row.name }]}
          rowKey={(row) => String(row.name)}
          rows={[{ name: "Ada" }]}
        />
        <UiPagination
          currentPage={1}
          onPageChange={() => undefined}
          totalPages={1}
        />
        <UiTabs
          items={[
            { content: "Profile body", label: "Profile", value: "profile" },
          ]}
        />
        <UiStatusPill label="Ready" tone="success" />
        <UiStatusTag label="Queued" tone="info" />
      </>,
    );

    expect(document.querySelector(".xr-card")).toBeTruthy();
    expect(document.querySelector(".xr-stat-card")).toBeTruthy();
    expect(document.querySelector(".xr-alert--success")).toBeTruthy();
    expect(document.querySelector(".xr-notification--success")).toBeTruthy();
    expect(document.querySelector(".xr-feedback--empty")).toBeTruthy();
    expect(document.querySelector(".xr-toast--success")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Rows" }).className).toContain(
      "xr-table",
    );
    expect(document.querySelector(".xr-pagination")).toBeTruthy();
    expect(document.querySelector(".xr-tabs__trigger")).toBeTruthy();
    expect(document.querySelector(".xr-status--success")).toBeTruthy();
    expect(document.querySelector(".xr-status-tag--info")).toBeTruthy();
  });
});
