import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { UiDataTable, type UiDataTableColumn } from "./admin-table";
import { UiButton } from "./button";
import { UiCheckbox, UiSwitch } from "./choice-controls";
import { UiConfirmDialog, UiDialog } from "./dialog";
import { UiDropdownMenu } from "./dropdown-menu";
import { UiNotification, UiCopyableText } from "./notification";
import { UiPagination } from "./pagination";
import { UiResourceError } from "./resource-error";
import { UiSearchFilterToolbar } from "./search-filter-toolbar";
import { UiStatusTag } from "./status-tag";
import { UiTabs } from "./tabs";
import { UiTextarea } from "./textarea";

interface AdminUserRow extends Record<string, unknown> {
  email: string;
  id: string;
  role: string;
  status: "Active" | "Invited";
}

const rows: AdminUserRow[] = [
  { email: "ada@example.com", id: "usr_01H", role: "Owner", status: "Active" },
  {
    email: "grace@example.com",
    id: "usr_02H",
    role: "Admin",
    status: "Invited",
  },
];

const columns: UiDataTableColumn<AdminUserRow>[] = [
  {
    id: "id",
    header: "ID",
    render: (row) => <UiCopyableText value={row.id} />,
  },
  { id: "email", header: "Email", render: (row) => row.email },
  { id: "role", header: "Role", render: (row) => row.role },
  {
    id: "status",
    header: "Status",
    render: (row) => (
      <UiStatusTag
        label={row.status}
        tone={row.status === "Active" ? "success" : "warning"}
      />
    ),
  },
];

const AdminPrimitiveShowcase = () => (
  <div style={{ display: "grid", gap: 18, width: "min(1080px, 92vw)" }}>
    <UiSearchFilterToolbar
      actions={<UiButton>Create user</UiButton>}
      searchPlaceholder="Search users"
      searchValue=""
    >
      <UiDropdownMenu
        items={[{ label: "Active" }, { label: "Invited" }]}
        trigger={<UiButton variant="secondary">Status</UiButton>}
      />
    </UiSearchFilterToolbar>
    <UiNotification message="2 users loaded" title="Synced" tone="success" />
    <UiDataTable
      aria-label="Admin users"
      columns={columns}
      getRowAriaLabel={(row) => `Open ${row.email}`}
      rowKey={(row) => row.id}
      rows={rows}
    />
    <UiPagination
      currentPage={1}
      onPageChange={() => undefined}
      pageSize={10}
      totalItems={20}
      totalPages={2}
    />
    <UiTabs
      items={[
        {
          content: (
            <UiTextarea aria-label="Internal notes" placeholder="Notes" />
          ),
          label: "Notes",
          value: "notes",
        },
        {
          content: (
            <div style={{ display: "grid", gap: 12 }}>
              <UiCheckbox label="Require approval" />
              <UiSwitch label="Enable notifications" />
            </div>
          ),
          label: "Settings",
          value: "settings",
        },
      ]}
    />
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <UiDialog
        description="Preview the shared admin dialog primitive."
        title="Edit user"
        trigger={<UiButton variant="secondary">Open dialog</UiButton>}
      >
        <p>Dialog content supports forms, alerts, and resource details.</p>
      </UiDialog>
      <UiConfirmDialog
        description="Confirm destructive or high-impact admin actions."
        onConfirm={() => undefined}
        title="Archive user"
        trigger={<UiButton variant="secondary">Confirm action</UiButton>}
      />
    </div>
  </div>
);

const meta = {
  title: "Components/AdminPrimitives",
  component: AdminPrimitiveShowcase,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof AdminPrimitiveShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const KitchenSink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: "Search" });

    await userEvent.type(search, "ada");
    await expect(
      canvas.getByRole("table", { name: "Admin users" }),
    ).toBeVisible();
  },
};

export const EmptyTable: Story = {
  render: () => (
    <UiDataTable
      aria-label="Empty users"
      columns={columns}
      emptyDescription="Invite a user to get started."
      emptyTitle="No users yet"
      rowKey={(row) => row.id}
      rows={[]}
    />
  ),
};

export const ResourceError: Story = {
  render: () => (
    <UiResourceError action={<UiButton variant="secondary">Retry</UiButton>} />
  ),
};
