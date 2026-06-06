import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/api-client";
import {
  AdminSearchFilterToolbar,
  ProductShell,
  UiActionsMenu,
  UiCard,
  UiCheckbox,
  UiConfirmDialog,
  UiDataTable,
  UiEmptyState,
  UiLoading,
  UiNotification,
  UiPagination,
  UiResourceError,
  UiSection,
  UiSelect,
  UiStatCard,
  UiStatusTag,
  UiTextarea,
  useI18n,
} from "@app/frontend-ui";
import {
  translate,
  type TranslationKey,
  type TranslationParams,
} from "@app/common/i18n";
import type { AdminAccess, AdminProfilePayload } from "./auth-rbac";

export type AdminProfileState =
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };

type Translate = (key: TranslationKey, params?: TranslationParams) => string;
const fallbackTranslate: Translate = (key, params) =>
  translate(key, { params });
export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}
type UserStatus = adminApi.AdminUserViewDto["status"];
type UserRow = adminApi.AdminUserViewDto & Record<string, unknown>;
type AuditRow = adminApi.AdminAuditLogViewDto & Record<string, unknown>;
type RoleRow = adminApi.AdminRbacCatalogPayloadDto["permissions"][number] &
  Record<string, unknown>;
const pageSize = 10;
const statusTone: Record<
  UserStatus | "ready" | "loading" | "error",
  "neutral" | "info" | "success" | "warning"
> = {
  active: "success",
  disabled: "warning",
  invited: "info",
  ready: "success",
  loading: "info",
  error: "warning",
};
const statusLabel: Record<UserStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  invited: "Invited",
};

export const normalizeAdminPath = (path: string): string => {
  const normalizedPath = path.split("?")[0]?.replace(/\/$/u, "") || "/";
  if (normalizedPath === "/admin") return "/";
  return normalizedPath.startsWith("/admin/")
    ? normalizedPath.slice("/admin".length) || "/"
    : normalizedPath;
};
const routeUserId = (path: string): string | undefined =>
  /^\/users\/([^/?]+)/u.exec(normalizeAdminPath(path))?.[1];
const paramsFromPath = (path: string) =>
  new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?")) : "");
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const totalPages = (total = 0, limit = pageSize) =>
  Math.max(1, Math.ceil(total / limit));
const join = (values?: readonly string[]) =>
  values?.length ? values.join(", ") : "—";
const formatDate = (value?: string) =>
  value ? new Date(value).toISOString() : "—";

export const AdminLayout = ({
  access,
  children,
  currentPath = "/",
}: Readonly<{
  access?: AdminAccess;
  children: React.ReactNode;
  currentPath?: string;
}>) => {
  const { t } = useI18n();
  const path = normalizeAdminPath(currentPath);
  const actions = [
    (access?.canReadDashboard ?? true)
      ? {
          href: "/admin",
          isCurrent: path === "/" || path === "/dashboard",
          label: t("admin.action.dashboard"),
        }
      : undefined,
    access?.canReadUsers
      ? {
          href: "/admin/users",
          isCurrent: path.startsWith("/users"),
          label: "Users",
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadRoles
      ? {
          href: "/admin/roles",
          isCurrent: path === "/roles",
          label: "Roles",
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadAudit
      ? {
          href: "/admin/audit",
          isCurrent: path === "/audit",
          label: "Audit",
          variant: "secondary" as const,
        }
      : undefined,
    {
      href: "/admin/tenants",
      isCurrent: path === "/tenants",
      label: "Tenants",
      variant: "secondary" as const,
    },
    (access?.canReadProfile ?? true)
      ? {
          href: "/admin/profile",
          isCurrent: path === "/profile",
          label: t("admin.action.profile"),
          variant: "secondary" as const,
        }
      : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <ProductShell
      actions={actions}
      appName={t("admin.appName")}
      description={t("admin.description")}
      homeHref="/admin"
      eyebrow={t("admin.eyebrow")}
      status={t("admin.status")}
      statusTone="warning"
      title={t("admin.title")}
    >
      {children}
    </ProductShell>
  );
};

const HealthCard = ({
  label,
  query,
}: Readonly<{
  label: string;
  query: { isLoading: boolean; error: unknown };
}>) => {
  let state: "ready" | "loading" | "error" = "ready";
  if (query.isLoading) {
    state = "loading";
  } else if (query.error) {
    state = "error";
  }
  const stateLabel = {
    error: "Unavailable",
    loading: "Loading",
    ready: "Ready",
  }[state];
  return (
    <UiCard title={label}>
      <UiStatusTag label={stateLabel} tone={statusTone[state]} />
    </UiCard>
  );
};

const DashboardStaticPage = ({ access }: Readonly<{ access: AdminAccess }>) => (
  <UiSection eyebrow="Dashboard" title="Admin dashboard">
    <UiCard title="Operational visibility">
      Review protected admin resources through TanStack Query and the shared API
      client.
    </UiCard>
    <UiCard title="Current access">
      {`Roles: ${access.roles.join(", ") || "none"}. Permissions: ${
        access.permissions.join(", ") || "none"
      }.`}
    </UiCard>
  </UiSection>
);

const DashboardDataPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions: ApiClientRequestOptions;
}>) => {
  const summary = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerDashboardSummaryQueryKey(),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerDashboardSummary(requestOptions),
      ),
    retry: false,
  });
  const health = useQuery({
    queryKey: ["admin-health", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerHealth(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("health");
        return true;
      }),
    retry: false,
  });
  const live = useQuery({
    queryKey: ["admin-live", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerLive(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("live");
        return true;
      }),
    retry: false,
  });
  const ready = useQuery({
    queryKey: ["admin-ready", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerReady(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("ready");
        return true;
      }),
    retry: false,
  });
  return (
    <UiSection eyebrow="Dashboard" title="Admin dashboard">
      <div className="xr-stat-grid">
        <UiStatCard
          label="Total users"
          value={`${summary.data?.totalUsers ?? "—"}`}
          detail="From /admin/dashboard/summary"
        />
        <UiStatCard
          label="Active users"
          value={`${summary.data?.activeUsers ?? "—"}`}
          detail="Current active users"
        />
        <UiStatCard
          label="Disabled users"
          value={`${summary.data?.disabledUsers ?? "—"}`}
          detail="Current disabled users"
        />
        <UiStatCard
          label="Recent audit"
          value={`${summary.data?.recentAuditEvents ?? "—"}`}
          detail="Recent audit events"
        />
      </div>
      {summary.isLoading ? (
        <UiLoading label="Loading admin dashboard summary" />
      ) : null}
      {summary.error ? (
        <UiResourceError
          title="Dashboard summary request failed"
          description={errorText(
            summary.error,
            "Dashboard summary request failed",
          )}
        />
      ) : null}
      <div className="xr-card-grid">
        <HealthCard label="Health" query={health} />
        <HealthCard label="Live" query={live} />
        <HealthCard label="Ready" query={ready} />
      </div>
      <UiCard title="Current access">{`Roles: ${access.roles.join(", ") || "none"}. Permissions: ${access.permissions.join(", ") || "none"}.`}</UiCard>
    </UiSection>
  );
};

export const DashboardPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
}>) =>
  requestOptions ? (
    <DashboardDataPage access={access} requestOptions={requestOptions} />
  ) : (
    <DashboardStaticPage access={access} />
  );

const renderUserDetail = (detail: {
  data?: adminApi.AdminUsersControllerGetUserData;
  error: unknown;
  isLoading: boolean;
}) => {
  if (detail.isLoading) {
    return <UiLoading label="Loading user detail" />;
  }
  if (detail.error) {
    return (
      <UiResourceError
        title="User detail request failed"
        description={errorText(detail.error, "User detail request failed")}
      />
    );
  }
  if (!detail.data) {
    return (
      <UiEmptyState
        title="No user selected"
        description="Select a real user from /admin/users to inspect details."
      />
    );
  }
  return (
    <dl className="xr-profile-list">
      <div>
        <dt>Email</dt>
        <dd>{detail.data.email}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{statusLabel[detail.data.status]}</dd>
      </div>
      <div>
        <dt>Roles</dt>
        <dd>{join(detail.data.roles)}</dd>
      </div>
      <div>
        <dt>Permissions</dt>
        <dd>{join(detail.data.permissions)}</dd>
      </div>
    </dl>
  );
};

export const UsersPage = ({
  access,
  currentPath,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  currentPath: string;
  requestOptions?: ApiClientRequestOptions;
}>) => {
  const qc = useQueryClient();
  const initial = paramsFromPath(currentPath);
  const [search, setSearch] = useState(initial.get("search") ?? "");
  const [status, setStatus] = useState(initial.get("status") ?? "all");
  const [role, setRole] = useState(initial.get("role") ?? "all");
  const [permission, setPermission] = useState(
    initial.get("permission") ?? "all",
  );
  const [page, setPage] = useState(Number(initial.get("page") ?? "1"));
  const [selected, setSelected] = useState(routeUserId(currentPath));
  const [notice, setNotice] = useState<{
    tone: "success" | "warning";
    message: string;
  }>();
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    email: string;
    nextStatus: UserStatus;
  }>();
  const [policyTarget, setPolicyTarget] = useState<UserRow>();
  const [policyStatus, setPolicyStatus] = useState<UserStatus>();
  const [reason, setReason] = useState("");
  const [policyRoles, setPolicyRoles] = useState<Set<string>>(new Set());
  const [policyPermissions, setPolicyPermissions] = useState<Set<string>>(
    new Set(),
  );
  const listParams = useMemo<adminApi.AdminUsersListQuery>(
    () => ({
      limit: pageSize,
      offset: (Math.max(1, page) - 1) * pageSize,
      search: search.trim() || undefined,
      status: status === "all" ? undefined : (status as UserStatus),
      role: role === "all" ? undefined : (role as "user" | "admin"),
      permission:
        permission === "all"
          ? undefined
          : (permission as adminApi.AdminUsersListQuery["permission"]),
    }),
    [page, permission, role, search, status],
  );
  const users = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerListUsersQueryKey(listParams),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerListUsers(listParams, requestOptions),
      ),
    retry: false,
  });
  const roles = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerRolesQueryKey(),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerRoles(requestOptions),
      ),
    retry: false,
  });
  const detail = useQuery({
    enabled: Boolean(selected),
    queryKey: [
      ...adminApi.getAdminUsersControllerGetUserQueryKey(selected ?? ""),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerGetUser(selected ?? "", requestOptions),
      ),
    retry: false,
  });
  const refetchCurrent = async () => {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: adminApi.getAdminUsersControllerListUsersQueryKey(listParams),
      }),
      selected
        ? qc.invalidateQueries({
            queryKey: adminApi.getAdminUsersControllerGetUserQueryKey(selected),
          })
        : Promise.resolve(),
      qc.invalidateQueries({
        queryKey: adminApi.getAdminUsersControllerDashboardSummaryQueryKey(),
      }),
    ]);
  };
  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: UserStatus }) =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerUpdateUserStatus(
          id,
          { status: nextStatus },
          requestOptions,
        ),
      ),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "Status update requested and current entities will refetch.",
      });
      await refetchCurrent();
    },
    onError: (error) =>
      setNotice({
        tone: "warning",
        message: errorText(error, "Status update failed"),
      }),
  });
  const policyMutation = useMutation({
    mutationFn: ({
      id,
      roles,
      permissions,
      status: nextStatus,
      currentStatus,
    }: {
      id: string;
      roles: ("user" | "admin")[];
      permissions: adminApi.UpdateAdminUserAccessPolicyDto["permissions"];
      status?: UserStatus;
      currentStatus?: UserStatus;
    }) => {
      if (nextStatus && nextStatus !== currentStatus) {
        return throwOnOpenApiErrorData(
          adminApi.adminUsersControllerUpdateUserStatus(
            id,
            { status: nextStatus },
            requestOptions,
          ),
        ).then(() =>
          throwOnOpenApiErrorData(
            adminApi.adminUsersControllerUpdateUserAccessPolicy(
              id,
              { roles, permissions },
              requestOptions,
            ),
          ),
        );
      }

      return throwOnOpenApiErrorData(
        adminApi.adminUsersControllerUpdateUserAccessPolicy(
          id,
          { roles, permissions },
          requestOptions,
        ),
      );
    },
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message:
          "Access policy update requested and current entities will refetch.",
      });
      await refetchCurrent();
    },
    onError: (error) =>
      setNotice({
        tone: "warning",
        message: errorText(error, "Access policy update failed"),
      }),
  });
  const rows = (users.data?.items ?? []) as UserRow[];
  const roleOptions = [
    { label: "All roles", value: "all" },
    ...(roles.data?.assignableRoles ?? access.roles).map((value) => ({
      label: value,
      value,
    })),
  ];
  const permissionOptions = [
    { label: "All permissions", value: "all" },
    ...(roles.data?.assignablePermissions ?? access.permissions).map(
      (value) => ({ label: value, value }),
    ),
  ];
  return (
    <UiSection eyebrow="Current user entities" title="Users">
      <AdminSearchFilterToolbar
        searchLabel="Search users"
        searchPlaceholder="Search email or display name"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onSubmit={() => setPage(1)}
      >
        <UiSelect
          aria-label="Filter users by status"
          label="Status"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Active", value: "active" },
            { label: "Disabled", value: "disabled" },
            { label: "Invited", value: "invited" },
          ]}
        />
        <UiSelect
          aria-label="Filter users by role"
          label="Role"
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={roleOptions}
        />
        <UiSelect
          aria-label="Filter users by permission"
          label="Permission"
          value={permission}
          onValueChange={(v) => {
            setPermission(v);
            setPage(1);
          }}
          options={permissionOptions}
        />
      </AdminSearchFilterToolbar>
      {notice ? (
        <UiNotification message={notice.message} tone={notice.tone} />
      ) : null}
      <UiDataTable<UserRow>
        rows={rows}
        rowKey={(row) => row.id}
        isLoading={users.isLoading}
        loadingLabel="Loading users"
        error={
          users.error
            ? errorText(users.error, "Users request failed")
            : undefined
        }
        emptyTitle="No users found"
        emptyDescription="No client-side fake data is shown; adjust filters or wait for real /admin/users data."
        onRowClick={(row) => setSelected(row.id)}
        getRowAriaLabel={(row) => `Open user ${row.email}`}
        columns={[
          { id: "email", header: "Email", render: (row) => row.email },
          {
            id: "status",
            header: "Status",
            render: (row) => (
              <UiStatusTag
                label={statusLabel[row.status]}
                tone={statusTone[row.status]}
              />
            ),
          },
          { id: "roles", header: "Roles", render: (row) => join(row.roles) },
          {
            id: "actions",
            header: "Actions",
            render: (row) => {
              const nextStatus =
                row.status === "active" ? "disabled" : "active";
              return (
                <UiActionsMenu
                  items={[
                    {
                      label: "Change status",
                      disabled: !access.canUpdateUserStatus,
                      tone: nextStatus === "disabled" ? "warning" : "default",
                      onSelect: () => {
                        setReason("");
                        setStatusTarget({
                          id: row.id,
                          email: row.email,
                          nextStatus,
                        });
                      },
                    },
                    {
                      label: "Edit access policy",
                      disabled: !access.canUpdateUserAccessPolicy,
                      onSelect: () => {
                        setReason("");
                        setPolicyTarget(row);
                        setPolicyStatus(row.status);
                        setPolicyRoles(new Set(row.roles));
                        setPolicyPermissions(new Set(row.permissions));
                      },
                    },
                  ]}
                />
              );
            },
          },
        ]}
      />
      <UiPagination
        currentPage={page}
        pageSize={users.data?.limit ?? pageSize}
        totalItems={users.data?.total ?? 0}
        totalPages={totalPages(users.data?.total, users.data?.limit)}
        onPageChange={setPage}
      />
      <UiCard title="User detail">{renderUserDetail(detail)}</UiCard>
      <UiConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(undefined)}
        title="Confirm status update"
        description={`Update ${statusTarget?.email ?? ""} to ${statusTarget?.nextStatus ? statusLabel[statusTarget.nextStatus] : ""}. Backend remains authoritative.`}
        confirmLabel="Update status"
        onConfirm={() => {
          if (!reason.trim()) {
            setNotice({
              tone: "warning",
              message: "Enter a reason before changing status.",
            });
            return;
          }
          if (statusTarget)
            statusMutation.mutate({
              id: statusTarget.id,
              nextStatus: statusTarget.nextStatus,
            });
          setStatusTarget(undefined);
        }}
      >
        <UiTextarea
          aria-label="Status update audit reason"
          placeholder="Optional reason for audit trail"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </UiConfirmDialog>
      <UiConfirmDialog
        open={Boolean(policyTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPolicyTarget(undefined);
            setPolicyStatus(undefined);
          }
        }}
        title="Confirm access policy update"
        description={`Update roles and permissions for ${policyTarget?.email ?? ""}. Backend remains authoritative.`}
        confirmLabel="Update access policy"
        onConfirm={() => {
          if (!reason.trim()) {
            setNotice({
              tone: "warning",
              message: "Enter a reason before changing access policy.",
            });
            return;
          }
          if (policyRoles.size === 0) {
            setNotice({
              tone: "warning",
              message:
                "Select at least one role before updating access policy.",
            });
            return;
          }
          if (policyTarget)
            policyMutation.mutate({
              id: policyTarget.id,
              currentStatus: policyTarget.status,
              status: policyStatus,
              roles: [...policyRoles] as ("user" | "admin")[],
              permissions: [
                ...policyPermissions,
              ] as adminApi.UpdateAdminUserAccessPolicyDto["permissions"],
            });
          setPolicyTarget(undefined);
          setPolicyStatus(undefined);
        }}
      >
        <UiSelect
          aria-label="Access policy status"
          label="Status"
          value={policyStatus ?? policyTarget?.status ?? "none"}
          onValueChange={(value) => setPolicyStatus(value as UserStatus)}
          options={[
            {
              label: policyTarget?.status
                ? statusLabel[policyTarget.status]
                : "Status unchanged",
              value: policyTarget?.status ?? "none",
            },
          ]}
        />
        <div className="xr-card-grid">
          {(roles.data?.assignableRoles ?? ["user", "admin"]).map((value) => (
            <UiCheckbox
              key={value}
              label={value}
              checked={policyRoles.has(value)}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                setPolicyRoles((current) => {
                  const next = new Set(current);
                  if (checked) {
                    next.add(value);
                  } else {
                    next.delete(value);
                  }
                  return next;
                })
              }
            />
          ))}
        </div>
        <div className="xr-card-grid">
          {(roles.data?.assignablePermissions ?? access.permissions).map(
            (value) => (
              <UiCheckbox
                key={value}
                label={value}
                checked={policyPermissions.has(value)}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  setPolicyPermissions((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(value);
                    } else {
                      next.delete(value);
                    }
                    return next;
                  })
                }
              />
            ),
          )}
        </div>
        <UiTextarea
          aria-label="Access policy audit reason"
          placeholder="Optional reason for audit trail"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </UiConfirmDialog>
    </UiSection>
  );
};

export const RolesPage = ({
  requestOptions,
}: Readonly<{ requestOptions?: ApiClientRequestOptions }>) => {
  const roles = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerRolesQueryKey(),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerRoles(requestOptions),
      ),
    retry: false,
  });
  const rows = (roles.data?.permissions ?? []) as RoleRow[];
  return (
    <UiSection eyebrow="RBAC catalog" title="Roles and permissions">
      <UiDataTable<RoleRow>
        rows={rows}
        rowKey={(row) => row.permission}
        isLoading={roles.isLoading}
        loadingLabel="Loading roles matrix"
        error={
          roles.error
            ? errorText(roles.error, "Roles request failed")
            : undefined
        }
        emptyTitle="No roles catalog entries"
        emptyDescription="No client-side fake data is shown; waiting for real /admin/roles data."
        columns={[
          {
            id: "permission",
            header: "Permission",
            render: (row) => row.permission,
          },
          { id: "resource", header: "Resource", render: (row) => row.resource },
          { id: "action", header: "Action", render: (row) => row.action },
          ...(roles.data?.roles ?? []).map((role) => ({
            id: role.role,
            header: role.label,
            align: "center" as const,
            render: (row: RoleRow) => (
              <UiCheckbox
                disabled
                checked={role.permissions.includes(row.permission)}
                label={`${row.permission} assigned to ${role.role}`}
              />
            ),
          })),
        ]}
      />
    </UiSection>
  );
};

export const AuditPage = ({
  requestOptions,
}: Readonly<{ requestOptions?: ApiClientRequestOptions }>) => {
  const [page, setPage] = useState(1);
  const params = useMemo<adminApi.AdminAuditListQuery>(
    () => ({ limit: pageSize, offset: (page - 1) * pageSize }),
    [page],
  );
  const audit = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerListAuditQueryKey(params),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerListAudit(params, requestOptions),
      ),
    retry: false,
  });
  const rows = (audit.data?.items ?? []) as AuditRow[];
  return (
    <UiSection eyebrow="Real admin audit events" title="Audit log">
      <UiDataTable<AuditRow>
        rows={rows}
        rowKey={(row) => row.id}
        isLoading={audit.isLoading}
        loadingLabel="Loading audit events"
        error={
          audit.error
            ? errorText(audit.error, "Audit request failed")
            : undefined
        }
        emptyTitle="No audit events"
        emptyDescription="No client-side fake data is shown; this table only renders real /admin/audit results."
        columns={[
          { id: "action", header: "Action", render: (row) => row.action },
          { id: "resource", header: "Resource", render: (row) => row.resource },
          {
            id: "actor",
            header: "Actor",
            render: (row) => row.actorUserId ?? "—",
          },
          {
            id: "target",
            header: "Target",
            render: (row) => row.targetUserId ?? "—",
          },
          {
            id: "created",
            header: "Created",
            render: (row) => formatDate(row.createdAt),
          },
        ]}
      />
      <UiPagination
        currentPage={page}
        pageSize={audit.data?.limit ?? pageSize}
        totalItems={audit.data?.total ?? 0}
        totalPages={totalPages(audit.data?.total, audit.data?.limit)}
        onPageChange={setPage}
      />
    </UiSection>
  );
};

export const TenantRoadmapPage = () => (
  <UiSection eyebrow="Roadmap" title="Tenants, memberships, and invitations">
    <UiEmptyState
      title="Tenant administration roadmap"
      description="No tenant, membership, or invitation table is rendered because this admin frontend only uses current real API entities."
    />
  </UiSection>
);

export const ProfilePage = ({
  payload,
}: Readonly<{ payload: AdminProfilePayload }>) => {
  const { t } = useI18n();
  const profile = payload.profile;
  const unknown = t("admin.profile.unknown");
  return (
    <UiSection
      eyebrow={t("admin.profile.eyebrow")}
      title={t("admin.profile.title")}
    >
      <UiCard
        title={
          profile?.displayName ??
          profile?.email ??
          t("admin.profile.fallbackDisplayName")
        }
      >
        <dl className="xr-profile-list">
          <div>
            <dt>{t("user.form.email")}</dt>
            <dd>
              {t("admin.profile.emailLine", {
                value: profile?.email ?? payload.principal?.email ?? unknown,
              })}
            </dd>
          </div>
          <div>
            <dt>{t("admin.dashboard.card.access.title")}</dt>
            <dd>
              {t("admin.profile.subjectLine", {
                value: payload.principal?.subject ?? profile?.id ?? unknown,
              })}
            </dd>
          </div>
        </dl>
      </UiCard>
    </UiSection>
  );
};
export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      eyebrow={t("admin.forbidden.eyebrow")}
      title={t("admin.forbidden.accessDeniedTitle")}
    >
      <UiEmptyState description={reason} title={t("admin.forbidden.title")} />
    </UiSection>
  );
};
export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      eyebrow={t("admin.notFound.eyebrow")}
      title={t("admin.notFound.sectionTitle")}
    >
      <UiEmptyState
        description={t("admin.notFound.description")}
        title={t("admin.notFound.title")}
      />
    </UiSection>
  );
};

/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
const renderReadyAdminRoute = (
  path: string,
  state: Extract<AdminProfileState, { status: "ready" }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): React.ReactNode => {
  const routePath = normalizeAdminPath(path);
  if (routePath === "/" || routePath === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage
        access={state.access}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason={t("admin.permission.dashboardMissing")} />
    );
  }
  if (routePath.startsWith("/users")) {
    return state.access.canReadUsers ? (
      <UsersPage
        access={state.access}
        currentPath={path}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason="Missing admin users permission." />
    );
  }
  if (routePath === "/roles") {
    return state.access.canReadRoles ? (
      <RolesPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason="Missing admin roles permission." />
    );
  }
  if (routePath === "/audit") {
    return state.access.canReadAudit ? (
      <AuditPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason="Missing admin audit permission." />
    );
  }
  if (routePath === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.profileMissing")} />
    );
  }
  return routePath === "/tenants" ? <TenantRoadmapPage /> : <NotFoundPage />;
};

/* eslint-disable sonarjs/function-return-type -- public route renderer intentionally returns React nodes for SSR tests. */
export const renderAdminRoute = (
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): React.ReactNode => {
  if (state.status === "loading") {
    return (
      <UiSection
        eyebrow={t("admin.loadingEyebrow")}
        title={t("admin.loadingProfile")}
      >
        <UiLoading label={t("admin.loadingProfile")} />
      </UiSection>
    );
  }
  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }
  const rendered = renderReadyAdminRoute(path, state, t, runtime);
  return rendered;
};
