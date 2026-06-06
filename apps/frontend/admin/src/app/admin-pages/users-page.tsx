import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/api-client";
import {
  AdminSearchFilterToolbar,
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
  UiStatusTag,
  UiTextarea,
  useI18n,
} from "@app/frontend-ui";
import type { AdminAccess } from "../auth-rbac";
import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import type { UserRow, UserStatus } from "./types";
import {
  errorText,
  join,
  pageSize,
  paramsFromPath,
  routeUserId,
  statusLabelKey,
  statusTone,
  totalPages,
} from "./utils";

const renderUserDetail = (
  detail: {
    data?: adminApi.AdminUsersControllerGetUserData;
    error: unknown;
    isLoading: boolean;
  },
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  if (detail.isLoading) {
    return <UiLoading label={t("admin.users.detail.loading")} />;
  }
  if (detail.error) {
    return (
      <UiResourceError
        title={t("admin.users.error.detailRequestFailed")}
        description={errorText(
          detail.error,
          "admin.users.error.detailRequestFailed",
          t,
        )}
      />
    );
  }
  if (!detail.data) {
    return (
      <UiEmptyState
        title={t("admin.users.detail.emptyEyebrow")}
        description={t("admin.users.detail.emptyTitle")}
      />
    );
  }
  return (
    <dl className="xr-profile-list">
      <div>
        <dt>{t("admin.users.column.email")}</dt>
        <dd>{detail.data.email}</dd>
      </div>
      <div>
        <dt>{t("admin.users.column.status")}</dt>
        <dd>{t(statusLabelKey[detail.data.status])}</dd>
      </div>
      <div>
        <dt>{t("admin.users.column.roles")}</dt>
        <dd>{join(detail.data.roles)}</dd>
      </div>
      <div>
        <dt>{t("admin.users.filter.permission")}</dt>
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
  const { t } = useI18n();
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
        message: t("admin.users.notice.statusUpdateRequested"),
      });
      await refetchCurrent();
    },
    onError: (error) =>
      setNotice({
        tone: "warning",
        message: errorText(error, "admin.users.error.statusUpdateFailed", t),
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
        message: t("admin.users.notice.accessPolicyUpdateRequested"),
      });
      await refetchCurrent();
    },
    onError: (error) =>
      setNotice({
        tone: "warning",
        message: errorText(
          error,
          "admin.users.error.accessPolicyUpdateFailed",
          t,
        ),
      }),
  });
  const rows = (users.data?.items ?? []) as UserRow[];
  const roleOptions = [
    { label: t("admin.users.filter.allRoles"), value: "all" },
    ...(roles.data?.assignableRoles ?? access.roles).map((value) => ({
      label: value,
      value,
    })),
  ];
  const permissionOptions = [
    { label: t("admin.users.filter.allPermissions"), value: "all" },
    ...(roles.data?.assignablePermissions ?? access.permissions).map(
      (value) => ({ label: value, value }),
    ),
  ];
  return (
    <UiSection
      eyebrow={t("admin.users.eyebrow")}
      title={t("admin.users.title")}
    >
      <AdminSearchFilterToolbar
        searchLabel={t("admin.users.searchLabel")}
        searchPlaceholder={t("admin.users.searchPlaceholder")}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onSubmit={() => setPage(1)}
      >
        <UiSelect
          label={t("admin.users.filter.status")}
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: t("admin.users.filter.allStatuses"), value: "all" },
            { label: t("admin.status.active"), value: "active" },
            { label: t("admin.status.disabled"), value: "disabled" },
            { label: t("admin.status.invited"), value: "invited" },
          ]}
        />
        <UiSelect
          label={t("admin.users.filter.role")}
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={roleOptions}
        />
        <UiSelect
          label={t("admin.users.filter.permission")}
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
        loadingLabel={t("admin.users.loading")}
        error={
          users.error
            ? errorText(users.error, "admin.users.error.requestFailed", t)
            : undefined
        }
        emptyTitle={t("admin.users.emptyEyebrow")}
        emptyDescription={t("admin.users.emptyTitle")}
        onRowClick={(row) => setSelected(row.id)}
        getRowAriaLabel={(row) =>
          t("admin.users.row.open", { email: row.email })
        }
        columns={[
          {
            id: "email",
            header: t("admin.users.column.email"),
            render: (row) => row.email,
          },
          {
            id: "status",
            header: t("admin.users.column.status"),
            render: (row) => (
              <UiStatusTag
                label={t(statusLabelKey[row.status])}
                tone={statusTone[row.status]}
              />
            ),
          },
          {
            id: "roles",
            header: t("admin.users.column.roles"),
            render: (row) => join(row.roles),
          },
          {
            id: "actions",
            header: t("admin.users.column.actions"),
            render: (row) => {
              const nextStatus =
                row.status === "active" ? "disabled" : "active";
              return (
                <UiActionsMenu
                  items={[
                    {
                      label: t("admin.users.action.changeStatus"),
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
                      label: t("admin.users.action.editAccessPolicy"),
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
      <UiCard title={t("admin.users.detail.title")}>
        {renderUserDetail(detail, t)}
      </UiCard>
      <UiConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(undefined)}
        title={t("admin.users.statusDialog.eyebrow")}
        description={t("admin.users.statusDialog.description", {
          email: statusTarget?.email ?? "",
          status: statusTarget?.nextStatus
            ? t(statusLabelKey[statusTarget.nextStatus])
            : "",
        })}
        confirmLabel={t("admin.users.statusDialog.title")}
        onConfirm={() => {
          if (!reason.trim()) {
            setNotice({
              tone: "warning",
              message: t("admin.users.error.statusReasonRequired"),
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
          aria-label={t("admin.users.statusDialog.reasonLabel")}
          placeholder={t("admin.users.reasonPlaceholder")}
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
        title={t("admin.users.policyDialog.eyebrow")}
        description={t("admin.users.policyDialog.description", {
          email: policyTarget?.email ?? "",
        })}
        confirmLabel={t("admin.users.policyDialog.title")}
        onConfirm={() => {
          if (!reason.trim()) {
            setNotice({
              tone: "warning",
              message: t("admin.users.error.policyReasonRequired"),
            });
            return;
          }
          if (policyRoles.size === 0) {
            setNotice({
              tone: "warning",
              message: t("admin.users.error.roleRequired"),
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
          label={t("admin.users.filter.status")}
          value={policyStatus ?? policyTarget?.status ?? "none"}
          onValueChange={(value) => setPolicyStatus(value as UserStatus)}
          options={[
            {
              label: policyTarget?.status
                ? t(statusLabelKey[policyTarget.status])
                : t("admin.users.status.unchanged"),
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
          aria-label={t("admin.users.policyDialog.reasonLabel")}
          placeholder={t("admin.users.reasonPlaceholder")}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </UiConfirmDialog>
    </UiSection>
  );
};
