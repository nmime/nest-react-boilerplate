import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiDataTable } from "./admin-table";
import { UiCheckbox, UiSwitch } from "./choice-controls";
import { UiConfirmDialog, UiDialog } from "./dialog";
import { UiDropdownMenu } from "./dropdown-menu";
import { UiCopyableText, UiNotification } from "./notification";
import { UiPagination } from "./pagination";
import { UiResourceError } from "./resource-error";
import { UiSearchFilterToolbar } from "./search-filter-toolbar";
import { UiStatusTag } from "./status-tag";
import { UiTabs } from "./tabs";
import { UiTextarea } from "./textarea";

interface UserRow extends Record<string, unknown> {
  email: string;
  id: string;
  status: string;
}

const columns = [
  { id: "id", header: "ID", render: (row: UserRow) => row.id },
  { id: "email", header: "Email", render: (row: UserRow) => row.email },
  {
    id: "status",
    header: "Status",
    render: (row: UserRow) => <UiStatusTag label={row.status} tone="success" />,
  },
] as const;

const rows: UserRow[] = [
  { email: "ada@example.com", id: "usr_1", status: "active" },
];

describe("admin UI primitives", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an accessible admin data table with keyboard row navigation", () => {
    const onRowClick = vi.fn();

    render(
      <UiDataTable
        aria-label="Users"
        columns={columns}
        getRowAriaLabel={(row) => `Open ${row.email}`}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    const table = screen.getByRole("table", { name: "Users" });
    expect(table.className).toContain("xr-table");
    expect(screen.getByRole("columnheader", { name: "Email" })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();

    const row = screen.getByLabelText("Open ada@example.com");
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("renders table loading, empty, and resource-error states", () => {
    const { rerender } = render(
      <UiDataTable
        columns={columns}
        isLoading
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Loading records");

    rerender(
      <UiDataTable columns={columns} rowKey={(row) => row.id} rows={[]} />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "No records found",
    );

    rerender(
      <UiDataTable
        columns={columns}
        error="The API timed out"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The API timed out",
    );
  });

  it("renders pagination with native buttons and page semantics", () => {
    const onPageChange = vi.fn();

    render(
      <UiPagination
        currentPage={2}
        onPageChange={onPageChange}
        pageSize={10}
        totalItems={35}
        totalPages={4}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeTruthy();
    expect(screen.getByText("11-20 of 35")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Go to page 2" })
        .getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders search/filter toolbar without unlabelled or native ugly controls", () => {
    const onSearchChange = vi.fn();

    render(
      <UiSearchFilterToolbar
        actions={<button type="button">Create user</button>}
        onSearchChange={onSearchChange}
        searchValue="ada"
      >
        <UiStatusTag label="Active" tone="info" />
      </UiSearchFilterToolbar>,
    );

    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(
      screen.getByRole("search", { name: "Search and filters" }),
    ).toBeTruthy();
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect(search.className).toContain("xr-input");
    fireEvent.change(search, { target: { value: "grace" } });
    expect(onSearchChange).toHaveBeenCalledWith("grace");
  });

  it("uses Radix dialog and confirm-dialog accessible roles", () => {
    const onConfirm = vi.fn();

    render(
      <UiDialog
        description="Edit profile details"
        open
        title="Edit user"
        trigger={<button type="button">Open</button>}
      >
        <p>Form goes here</p>
      </UiDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Edit user" })).toBeTruthy();

    cleanup();

    render(
      <UiConfirmDialog
        description="This cannot be undone."
        onConfirm={onConfirm}
        open
        title="Delete user"
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete user" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders tabs as keyboard-friendly Radix tab controls", () => {
    render(
      <UiTabs
        items={[
          { content: "Profile content", label: "Profile", value: "profile" },
          { content: "Audit content", label: "Audit", value: "audit" },
        ]}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Sections" })).toBeTruthy();
    const profileTab = screen.getByRole("tab", { name: "Profile" });
    expect(profileTab.className).toContain("xr-tabs__trigger");
    expect(profileTab.getAttribute("aria-selected")).toBe("true");
  });

  it("renders checkbox, switch, and textarea without native checkbox/switch styling", () => {
    render(
      <>
        <UiCheckbox checked label="Select row" onCheckedChange={vi.fn()} />
        <UiSwitch checked label="Enabled" onCheckedChange={vi.fn()} />
        <label htmlFor="notes">Notes</label>
        <UiTextarea id="notes" placeholder="Admin notes" />
      </>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select row" });
    const switchControl = screen.getByRole("switch", { name: "Enabled" });
    const notes = screen.getByRole("textbox", { name: "Notes" });

    expect(checkbox.tagName.toLowerCase()).toBe("button");
    expect(checkbox.className).toContain("xr-checkbox");
    expect(switchControl.tagName.toLowerCase()).toBe("button");
    expect(switchControl.className).toContain("xr-switch");
    expect(notes.className).toContain("xr-textarea");
  });

  it("renders notification, copyable text, resource errors, and status tags", () => {
    const writeText = vi.fn();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <>
        <UiNotification
          message="Saved changes"
          title="Success"
          tone="success"
        />
        <UiCopyableText value="usr_123" />
        <UiResourceError action={<button type="button">Retry</button>} />
        <UiStatusTag label="Provisioning" tone="warning" />
      </>,
    );

    expect(screen.getByRole("status").textContent).toContain("Saved changes");
    fireEvent.click(
      screen.getByRole("button", { name: "Copy value: usr_123" }),
    );
    expect(writeText).toHaveBeenCalledWith("usr_123");
    expect(screen.getByRole("alert").textContent).toContain(
      "Resource unavailable",
    );
    expect(screen.getByText("Provisioning").getAttribute("data-tone")).toBe(
      "warning",
    );
  });

  it("renders a Radix dropdown menu trigger without native select controls", () => {
    const html = renderToStaticMarkup(
      <UiDropdownMenu
        items={[{ label: "Archive" }, { label: "Delete", tone: "warning" }]}
        trigger={<button type="button">Actions</button>}
      />,
    );

    expect(html).toContain("Actions");
    expect(html).not.toContain("<select");
  });
});
