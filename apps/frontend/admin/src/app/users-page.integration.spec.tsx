import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "@app/frontend-api-client";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
} from "@app/frontend-runtime";
import { adminFrontendTranslations } from "@app/frontend-feature-admin-i18n";
import { createAdminAccess } from "../entities/admin-session";
import { UsersPage } from "../pages/users";

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
}

const fullAccess = createAdminAccess({
  subject: "admin-id",
  roles: ["admin"],
  permissions: [
    "admin:dashboard:read",
    "admin:profile:read",
    "admin:users:read",
    "admin:users:status:update",
    "admin:users:access-policy:update",
    "admin:roles:read",
    "admin:roles:write",
    "admin:audit:read",
  ],
});

const activeUser = {
  id: "user-1",
  tenantId: "tenant-1",
  email: "user@example.com",
  status: "active" as const,
  roles: ["user"],
  permissions: ["profile:read"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const disabledUser = {
  ...activeUser,
  id: "user-2",
  email: "disabled@example.com",
  status: "disabled" as const,
  roles: [],
  permissions: [],
};

const rolesCatalog = {
  resources: ["admin.users"],
  assignableRoles: ["user", "admin"],
  assignablePermissions: ["profile:read", "admin:users:read"],
  roles: [
    {
      id: "role-user",
      role: "user",
      label: "User",
      description: "User",
      isSystem: true,
      permissions: ["profile:read"],
    },
    {
      id: "role-admin",
      role: "admin",
      label: "Administrator",
      description: "Admin",
      isSystem: true,
      permissions: ["admin:users:read"],
    },
  ],
  permissions: [
    {
      permission: "profile:read",
      resource: "admin.profile",
      action: "read",
      description: "Profile",
    },
    {
      permission: "admin:users:read",
      resource: "admin.users",
      action: "read",
      description: "Users",
    },
  ],
};

const ok = <T,>(data: T, status = 200) => ({
  data,
  error: undefined,
  response: new Response(null, { status }),
});

const AdminTestProviders = ({
  children,
}: Readonly<{ children: ReactElement }>) => (
  <FrontendStateProvider>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const renderUsersPage = (currentPath = "/admin/users") =>
  render(
    <AdminTestProviders>
      <UsersPage access={fullAccess} currentPath={currentPath} />
    </AdminTestProviders>,
  );

const mockList = () =>
  vi
    .spyOn(adminApi, "adminUsersControllerListUsers")
    .mockResolvedValue(
      ok({ items: [activeUser], total: 1, limit: 10, offset: 0 }),
    );

const mockRoles = () =>
  vi
    .spyOn(adminApi, "adminUsersControllerRoles")
    .mockResolvedValue(ok(rolesCatalog));

const openActionsMenu = () => {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
};

describe("admin users page interactions", () => {
  beforeEach(() => {
    installRadixPointerMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("updates the list query from search input, submit, and filter selects", async () => {
    const listSpy = mockList();
    mockRoles();

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), {
      target: { value: "ada" },
    });
    fireEvent.submit(screen.getByRole("search"));

    fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Role" }));
    fireEvent.click(await screen.findByRole("option", { name: "admin" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Permission" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "admin:users:read" }),
    );

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
          search: "ada",
          status: "active",
          role: "admin",
          permission: "admin:users:read",
        }),
        undefined,
      );
    });
    expect(screen.getByText("Focused directory view")).toBeTruthy();
  });

  it("requires a reason before requesting a status change and then submits it", async () => {
    mockList();
    mockRoles();
    vi.spyOn(adminApi, "adminUsersControllerGetUser").mockResolvedValue(
      ok(activeUser),
    );
    const statusSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserStatus")
      .mockResolvedValue(ok({ ...activeUser, status: "disabled" }));

    renderUsersPage("/admin/users/user-1");
    expect(
      (await screen.findAllByText("user@example.com")).length,
    ).toBeGreaterThan(0);
    const [emailCell] = screen.getAllByText("user@example.com");
    if (!emailCell) {
      throw new Error("Expected user email to render.");
    }
    fireEvent.click(emailCell);
    expect(await screen.findByText("Access policy snapshot")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Change status" }),
    );
    // Confirm without a reason surfaces a validation notice.
    fireEvent.click(
      await screen.findByRole("button", { name: "Update status" }),
    );
    expect(
      await screen.findByText("Enter a reason before changing status."),
    ).toBeTruthy();
    expect(statusSpy).not.toHaveBeenCalled();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Change status" }),
    );
    fireEvent.change(screen.getByLabelText("Status update audit reason"), {
      target: { value: "policy violation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith(
        "user-1",
        { status: "disabled" },
        undefined,
      );
    });
    expect(
      await screen.findByText(
        "Status update requested and current entities will refetch.",
      ),
    ).toBeTruthy();
  });

  it("surfaces a backend rejection of a status change", async () => {
    mockList();
    mockRoles();
    vi.spyOn(
      adminApi,
      "adminUsersControllerUpdateUserStatus",
    ).mockRejectedValue(new Error("status backend rejected"));

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Change status" }),
    );
    fireEvent.change(screen.getByLabelText("Status update audit reason"), {
      target: { value: "reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    expect(await screen.findByText("status backend rejected")).toBeTruthy();
  });

  it("cancels the status dialog without mutating", async () => {
    mockList();
    mockRoles();
    const statusSpy = vi.spyOn(
      adminApi,
      "adminUsersControllerUpdateUserStatus",
    );

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Change status" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeFalsy();
    });
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("edits an access policy by toggling roles and permissions", async () => {
    mockList();
    mockRoles();
    const accessSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserAccessPolicy")
      .mockResolvedValue(
        ok({
          ...activeUser,
          roles: ["admin"],
          permissions: ["admin:users:read"],
        }),
      );

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    // Toggle roles: drop the current role, add admin.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "user" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "admin" }));
    // Toggle permissions: add one, remove the current one.
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "admin:users:read" }),
    );
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "profile:read" }),
    );
    // Exercise the single-option status select in the dialog.
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Status" }));
    const activeOption = screen.queryByRole("option", { name: "Active" });
    if (activeOption) {
      fireEvent.click(activeOption);
    }
    fireEvent.change(
      within(dialog).getByLabelText("Access policy audit reason"),
      { target: { value: "elevating access" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update access policy" }),
    );

    await waitFor(() => {
      expect(accessSpy).toHaveBeenCalledWith(
        "user-1",
        { roles: ["admin"], permissions: ["admin:users:read"] },
        undefined,
      );
    });
    expect(
      await screen.findByText(
        "Access policy update requested and current entities will refetch.",
      ),
    ).toBeTruthy();
  });

  it("updates status before access policy when the policy dialog status changes", async () => {
    mockList();
    mockRoles();
    const statusSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserStatus")
      .mockResolvedValue(ok({ ...activeUser, status: "disabled" }));
    const accessSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserAccessPolicy")
      .mockResolvedValue(ok(activeUser));

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Disabled" }));
    fireEvent.change(
      within(dialog).getByLabelText("Access policy audit reason"),
      { target: { value: "sync policy and lifecycle" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update access policy" }),
    );

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith(
        "user-1",
        { status: "disabled" },
        undefined,
      );
      expect(accessSpy).toHaveBeenCalledWith(
        "user-1",
        { roles: ["user"], permissions: ["profile:read"] },
        undefined,
      );
    });
  });

  it("surfaces a backend rejection of an access policy update", async () => {
    mockList();
    mockRoles();
    vi.spyOn(
      adminApi,
      "adminUsersControllerUpdateUserAccessPolicy",
    ).mockRejectedValue(new Error("policy backend rejected"));

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(
      within(dialog).getByLabelText("Access policy audit reason"),
      { target: { value: "reason" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update access policy" }),
    );

    expect(await screen.findByText("policy backend rejected")).toBeTruthy();
  });

  it("validates reason and role selection before updating an access policy", async () => {
    mockList();
    mockRoles();
    const accessSpy = vi.spyOn(
      adminApi,
      "adminUsersControllerUpdateUserAccessPolicy",
    );

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    // Missing reason.
    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Update access policy" }),
    );
    expect(
      await screen.findByText("Enter a reason before changing access policy."),
    ).toBeTruthy();

    // Reason present but no roles selected.
    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "user" }));
    fireEvent.change(
      within(dialog).getByLabelText("Access policy audit reason"),
      { target: { value: "reason" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update access policy" }),
    );
    expect(
      await screen.findByText(
        "Select at least one role before updating access policy.",
      ),
    ).toBeTruthy();
    expect(accessSpy).not.toHaveBeenCalled();
  });

  it("requires at least one role before assigning roles", async () => {
    mockList();
    mockRoles();
    const assignSpy = vi.spyOn(adminApi, "adminRolesControllerAssignUserRoles");

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Assign roles" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    // Uncheck the pre-selected role, leaving the selection empty.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "user" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign roles" }));

    expect(
      await screen.findByText(
        "Select at least one role before updating access policy.",
      ),
    ).toBeTruthy();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("surfaces a backend rejection of a role assignment", async () => {
    mockList();
    mockRoles();
    vi.spyOn(adminApi, "adminRolesControllerAssignUserRoles").mockRejectedValue(
      new Error("assignment backend rejected"),
    );

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Assign roles" }),
    );
    // Keep the pre-selected role and submit.
    fireEvent.click(
      await screen.findByRole("button", { name: "Assign roles" }),
    );

    expect(await screen.findByText("assignment backend rejected")).toBeTruthy();
  });

  it("renders users with empty access lists and a disabled status action", async () => {
    vi.spyOn(adminApi, "adminUsersControllerListUsers").mockResolvedValue(
      ok({ items: [disabledUser], total: 1, limit: 10, offset: 0 }),
    );
    mockRoles();
    vi.spyOn(adminApi, "adminUsersControllerGetUser").mockResolvedValue(
      ok(disabledUser),
    );

    renderUsersPage("/admin/users/user-2");
    expect(
      (await screen.findAllByText("disabled@example.com")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Access policy snapshot")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    openActionsMenu();
    expect(
      await screen.findByRole("menuitem", { name: "Change status" }),
    ).toBeTruthy();
  });

  it("uses access fallbacks when the roles catalog is unavailable", async () => {
    mockList();
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockRejectedValue(
      new Error("roles unavailable"),
    );

    renderUsersPage();
    expect(await screen.findByText("user@example.com")).toBeTruthy();

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit access policy" }),
    );
    const policyDialog = await screen.findByRole("alertdialog");
    expect(
      within(policyDialog).getByRole("checkbox", { name: "admin" }),
    ).toBeTruthy();
    expect(
      within(policyDialog).getByRole("checkbox", {
        name: "admin:dashboard:read",
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(policyDialog).getByRole("button", { name: "Cancel" }),
    );

    openActionsMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Assign roles" }),
    );
    const rolesDialog = await screen.findByRole("alertdialog");
    expect(
      within(rolesDialog).getByRole("checkbox", { name: "admin" }),
    ).toBeTruthy();
  });

  it("renders the directory error state when the list request fails", async () => {
    vi.spyOn(adminApi, "adminUsersControllerListUsers").mockRejectedValue(
      new Error("directory offline"),
    );
    mockRoles();

    renderUsersPage();

    expect(await screen.findByText("directory offline")).toBeTruthy();
  });
});
