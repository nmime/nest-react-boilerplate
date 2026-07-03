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

const storyFrameStyle = {
  display: "grid",
  gap: 18,
  width: "min(1080px, 92vw)",
} as const;

const StoryFrame = ({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) => {
  const headingId = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");

  return (
    <section aria-labelledby={headingId} style={storyFrameStyle}>
      <h1 className="sr-only" id={headingId}>
        {title}
      </h1>
      {children}
    </section>
  );
};

const AdminPrimitiveShowcase = () => (
  <StoryFrame title="Admin primitives kitchen sink">
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
  </StoryFrame>
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
    <StoryFrame title="Empty admin table">
      <UiDataTable
        aria-label="Empty users"
        columns={columns}
        emptyDescription="Invite a user to get started."
        emptyTitle="No users yet"
        rowKey={(row) => row.id}
        rows={[]}
      />
    </StoryFrame>
  ),
};

export const TableLoading: Story = {
  render: () => (
    <StoryFrame title="Loading admin table">
      <UiDataTable
        aria-label="Loading users"
        columns={columns}
        isLoading
        rowKey={(row) => row.id}
        rows={[]}
      />
    </StoryFrame>
  ),
};

export const ResourceError: Story = {
  render: () => (
    <StoryFrame title="Resource error">
      <UiResourceError
        action={<UiButton variant="secondary">Retry</UiButton>}
      />
    </StoryFrame>
  ),
};

export const DropdownOpened: Story = {
  render: () => (
    <StoryFrame title="Opened dropdown menu">
      <UiDropdownMenu
        defaultOpen
        items={[
          { label: "Archive" },
          { disabled: true, label: "Suspend" },
          { label: "Delete", tone: "warning" },
        ]}
        trigger={<UiButton variant="secondary">Actions</UiButton>}
      />
    </StoryFrame>
  ),
};

export const DialogOpened: Story = {
  render: () => (
    <StoryFrame title="Opened dialog">
      <UiDialog
        description="Preview the shared admin dialog primitive."
        open
        title="Edit user"
        trigger={<UiButton variant="secondary">Open dialog</UiButton>}
      >
        <p>Dialog content supports forms, alerts, and resource details.</p>
      </UiDialog>
    </StoryFrame>
  ),
};

export const ConfirmDialogOpened: Story = {
  render: () => (
    <StoryFrame title="Opened confirm dialog">
      <UiConfirmDialog
        description="Confirm destructive or high-impact admin actions."
        onConfirm={() => undefined}
        open
        title="Archive user"
        trigger={<UiButton variant="secondary">Confirm action</UiButton>}
      />
    </StoryFrame>
  ),
};

export const DisabledControls: Story = {
  render: () => (
    <StoryFrame title="Disabled controls">
      <UiSearchFilterToolbar
        actions={<UiButton disabled>Create user</UiButton>}
        searchValue="Disabled query"
      >
        <UiDropdownMenu
          items={[{ disabled: true, label: "Active" }]}
          trigger={
            <UiButton disabled variant="secondary">
              Status
            </UiButton>
          }
        />
      </UiSearchFilterToolbar>
      <UiCheckbox disabled label="Require approval" />
      <UiSwitch disabled label="Enable notifications" />
      <UiTextarea
        aria-label="Disabled notes"
        disabled
        value="Read-only notes"
      />
      <UiPagination
        currentPage={1}
        onPageChange={() => undefined}
        pageSize={10}
        totalItems={10}
        totalPages={1}
      />
    </StoryFrame>
  ),
};

export const NotificationVariants: Story = {
  render: () => (
    <StoryFrame title="Notification variants">
      <UiNotification message="Sync is healthy" title="Info" tone="info" />
      <UiNotification message="Saved changes" title="Success" tone="success" />
      <UiNotification
        action={<UiButton variant="secondary">Review</UiButton>}
        message="Billing usage is near the limit"
        title="Warning"
        tone="warning"
      />
    </StoryFrame>
  ),
};

export const StatusAndResourceVariants: Story = {
  render: () => (
    <StoryFrame title="Status and resource variants">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <UiStatusTag label="Neutral" tone="neutral" />
        <UiStatusTag label="Info" tone="info" />
        <UiStatusTag label="Success" tone="success" />
        <UiStatusTag label="Warning" tone="warning" />
      </div>
      <UiResourceError
        action={<UiButton variant="secondary">Reconnect</UiButton>}
        description="The admin API returned a recoverable error."
        title="Admin API unavailable"
      />
    </StoryFrame>
  ),
};
