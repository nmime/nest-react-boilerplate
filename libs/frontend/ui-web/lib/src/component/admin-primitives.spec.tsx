import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminDataTable,
  UiDataTable,
  UiTable,
  UiTableBody,
  UiTableCell,
  UiTableHead,
  UiTableHeader,
  UiTableRow,
} from "./admin-table";
import { UiCheckbox, UiSwitch } from "./choice-controls";
import { UiConfirmDialog, UiDialog } from "./dialog";
import { UiActionsMenu, UiDropdownMenu } from "./dropdown-menu";
import { UiButton } from "./button";
import { UiCopyableText, UiNotification } from "./notification";
import { UiPagination } from "./pagination";
import { UiResourceError } from "./resource-error";
import {
  AdminSearchFilterToolbar,
  UiSearchFilterToolbar,
} from "./search-filter-toolbar";
import { UiStatusTag } from "./status-tag";
import { UiTabs } from "./tabs";
import { UiSelect } from "./select";
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

  it("supports AdminDataTable alias export and table error action callbacks", () => {
    const onRetry = vi.fn();

    render(
      <AdminDataTable
        columns={columns}
        error="The API timed out"
        errorAction={{ label: "Retry users", onClick: onRetry }}
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "The API timed out",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry users" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders standalone UiTable primitives with semantic classes", () => {
    render(
      <UiTable aria-label="Standalone table">
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>Header</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow>
            <UiTableCell>Cell value</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>,
    );

    expect(
      screen.getByRole("table", { name: "Standalone table" }),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Header" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Cell value" })).toBeTruthy();
    expect(screen.getByRole("row", { name: "Cell value" }).className).toContain(
      "xr-table__row",
    );
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

  it("disables pagination edge buttons and keeps page callbacks bounded", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <UiPagination
        currentPage={1}
        onPageChange={onPageChange}
        totalPages={3}
      />,
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Go to previous page",
      }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    rerender(
      <UiPagination
        currentPage={3}
        onPageChange={onPageChange}
        pageSize={25}
        totalItems={60}
        totalPages={3}
      />,
    );

    expect(screen.getByText("51-60 of 60")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Go to next page",
      }).disabled,
    ).toBe(true);
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

  it("keeps toolbar filters outside the search form so Radix selects stay semantic-only", () => {
    render(
      <UiSearchFilterToolbar searchLabel="Search users">
        <UiSelect
          aria-label="Filter users by status"
          label="Status"
          onValueChange={vi.fn()}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Active", value: "active" },
          ]}
          value="all"
        />
      </UiSearchFilterToolbar>,
    );

    expect(
      screen.getByRole("searchbox", { name: "Search users" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter users by status" }),
    ).toBeTruthy();
    expect(document.querySelectorAll("select")).toHaveLength(0);

    const semanticControls = Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea"),
    );
    const labelCountFor = (
      control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    ): number => control.labels?.length ?? 0;

    expect(
      semanticControls.filter(
        (control) =>
          labelCountFor(control) === 0 &&
          !control.getAttribute("aria-label") &&
          !control.getAttribute("aria-labelledby"),
      ),
    ).toEqual([]);
  });

  it("supports AdminSearchFilterToolbar alias, submit, custom labels, and partial modes", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <AdminSearchFilterToolbar
        label="User tools"
        onSubmit={onSubmit}
        searchLabel="Find user"
        searchPlaceholder="Email or ID"
        searchValue="ada"
      />,
    );

    expect(screen.getByRole("search", { name: "User tools" })).toBeTruthy();
    expect(
      screen
        .getByRole("searchbox", { name: "Find user" })
        .getAttribute("placeholder"),
    ).toBe("Email or ID");
    fireEvent.submit(screen.getByRole("search", { name: "User tools" }));
    expect(onSubmit).toHaveBeenCalledWith("ada");

    rerender(
      <AdminSearchFilterToolbar
        actions={<UiButton>Create</UiButton>}
        label="Actions only"
      />,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();

    rerender(
      <AdminSearchFilterToolbar label="Filters only">
        <UiStatusTag label="Active" tone="success" />
      </AdminSearchFilterToolbar>,
    );
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("opens dropdown menus with item roles, disabled state, selection, and focus", () => {
    const onArchive = vi.fn();
    render(
      <UiDropdownMenu
        items={[
          { label: "Archive", onSelect: onArchive },
          { disabled: true, label: "Suspend" },
          { label: "Delete", tone: "warning" },
        ]}
        trigger={<UiButton variant="secondary">Actions</UiButton>}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.pointerDown(trigger);

    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu).toBeTruthy();
    const archive = screen.getByRole("menuitem", { name: "Archive" });
    expect(
      screen
        .getByRole("menuitem", { name: "Suspend" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: "Delete" }).className,
    ).toContain("xr-menu__item--warning");
    archive.focus();
    expect(document.activeElement).toBe(archive);
    fireEvent.click(archive);
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("supports UiActionsMenu alias and keyboard opening", () => {
    const onSelect = vi.fn();
    render(<UiActionsMenu items={[{ label: "Open", onSelect }]} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("uses Radix dialog accessible roles, open-change callbacks, close, and focus", () => {
    const onOpenChange = vi.fn();

    render(
      <UiDialog
        description="Edit profile details"
        onOpenChange={onOpenChange}
        title="Edit user"
        trigger={<button type="button">Open</button>}
      >
        <button type="button">First focus target</button>
      </UiDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("dialog", { name: "Edit user" })).toBeTruthy();
    const focusTarget = screen.getByRole("button", {
      name: "First focus target",
    });
    focusTarget.focus();
    expect(document.activeElement).toBe(focusTarget);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("supports confirm dialog confirm, cancel, and open-change callbacks", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <UiConfirmDialog
        description="This cannot be undone."
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        title="Delete user"
        trigger={<UiButton>Delete</UiButton>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("alertdialog", { name: "Delete user" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
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

  it("supports tabs arrow activation, value callbacks, and disabled tabs", () => {
    const onValueChange = vi.fn();
    render(
      <UiTabs
        items={[
          { content: "Profile content", label: "Profile", value: "profile" },
          { content: "Audit content", label: "Audit", value: "audit" },
          {
            content: "Danger content",
            disabled: true,
            label: "Danger",
            value: "danger",
          },
        ]}
        onValueChange={onValueChange}
      />,
    );

    const profile = screen.getByRole("tab", { name: "Profile" });
    const audit = screen.getByRole("tab", { name: "Audit" });
    expect(
      screen.getByRole<HTMLButtonElement>("tab", { name: "Danger" }).disabled,
    ).toBe(true);
    profile.focus();
    fireEvent.keyDown(profile, { key: "ArrowRight" });
    fireEvent.pointerDown(audit);
    fireEvent.keyDown(audit, { key: "Enter" });
    fireEvent.click(audit);
    expect(onValueChange).toHaveBeenCalledWith("audit");
    expect(screen.getByText("Audit content")).toBeTruthy();
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

  it("handles checkbox and switch changes, disabled state, and descriptions", () => {
    const onCheckboxChange = vi.fn();
    const onSwitchChange = vi.fn();

    render(
      <>
        <UiCheckbox
          description="Selects the current user row"
          label="Select row"
          onCheckedChange={onCheckboxChange}
        />
        <UiSwitch
          description="Send lifecycle emails"
          label="Notifications"
          onCheckedChange={onSwitchChange}
        />
        <UiCheckbox disabled label="Disabled checkbox" />
        <UiSwitch disabled label="Disabled switch" />
      </>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select row" });
    const switchControl = screen.getByRole("switch", { name: "Notifications" });
    expect(checkbox.getAttribute("aria-describedby")).toBeTruthy();
    expect(switchControl.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(checkbox);
    fireEvent.click(switchControl);
    expect(onCheckboxChange).toHaveBeenCalledWith(true);
    expect(onSwitchChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole<HTMLButtonElement>("checkbox", {
        name: "Disabled checkbox",
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("switch", {
        name: "Disabled switch",
      }).disabled,
    ).toBe(true);
  });

  it("supports textarea disabled, invalid, change, and default rows", () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="notes">Notes</label>
        <UiTextarea aria-invalid id="notes" onChange={onChange} />
        <label htmlFor="disabled-notes">Disabled notes</label>
        <UiTextarea disabled id="disabled-notes" />
      </>,
    );

    const notes = screen.getByRole("textbox", { name: "Notes" });
    expect(notes.getAttribute("rows")).toBe("4");
    expect(notes.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(notes, { target: { value: "Updated" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", {
        name: "Disabled notes",
      }).disabled,
    ).toBe(true);
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

  it("supports notification warning/action variants, resource error props, and status tones", () => {
    const onAction = vi.fn();
    render(
      <>
        <UiNotification
          action={<UiButton onClick={onAction}>Review</UiButton>}
          message="Quota is almost exhausted"
          title="Warning"
          tone="warning"
        />
        <UiResourceError
          action={<UiButton onClick={onAction}>Retry</UiButton>}
          aria-label="Users failed"
          description="Custom failure"
          title="Custom title"
        />
        {(["neutral", "info", "success", "warning"] as const).map((tone) => (
          <UiStatusTag key={tone} label={tone} tone={tone} />
        ))}
      </>,
    );

    expect(
      screen.getByRole("alert", { name: "Users failed" }).textContent,
    ).toContain("Custom failure");
    expect(screen.getByText("Quota is almost exhausted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledTimes(2);
    for (const tone of ["neutral", "info", "success", "warning"]) {
      expect(screen.getByText(tone).getAttribute("data-tone")).toBe(tone);
    }
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
