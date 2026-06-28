import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend/api-client";
import {
  UiCard,
  UiCheckbox,
  UiDataTable,
  UiSection,
  UiStatCard,
  UiStatusTag,
  useI18n,
} from "@app/frontend/ui";
import type { RoleRow } from "../../entities/admin-role";
import { errorText } from "../../shared";

export const RolesPage = ({
  requestOptions,
}: Readonly<{ requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
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
  const roleCatalog = roles.data?.roles ?? [];
  return (
    <UiSection
      className="admin-page admin-roles-page"
      eyebrow={t("admin.roles.eyebrow")}
      title={t("admin.roles.title")}
    >
      <UiCard className="admin-command-center" title="Role governance map">
        <div className="admin-command-center__hero">
          <div>
            <p className="xr-eyebrow">Access model v3</p>
            <strong>
              Matrix-first role review with read-only assignments.
            </strong>
            <span>
              Administrators can compare roles, permissions, resources, and
              actions without enabling accidental edits.
            </span>
          </div>
          <UiStatusTag
            label={roles.isLoading ? t("admin.state.loading") : "RBAC catalog"}
            tone={roles.error ? "warning" : "info"}
          />
        </div>
        <div
          className="admin-chip-row"
          aria-label={t("admin.users.filter.role")}
        >
          {(roleCatalog.length ? roleCatalog : []).map((role) => (
            <span className="admin-chip admin-chip--strong" key={role.role}>
              {role.label}
            </span>
          ))}
        </div>
      </UiCard>
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.users.filter.role")}
          value={`${roles.data?.roles.length ?? "—"}`}
          detail={t("admin.roles.title")}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.users.filter.permission")}
          value={`${rows.length || "—"}`}
          detail={t("admin.roles.emptyTitle")}
        />
      </div>
      <UiCard className="admin-table-card" title={t("admin.roles.title")}>
        <UiDataTable<RoleRow>
          rows={rows}
          rowKey={(row) => row.permission}
          isLoading={roles.isLoading}
          loadingLabel={t("admin.roles.loading")}
          error={
            roles.error
              ? errorText(roles.error, "admin.roles.error.requestFailed", t)
              : undefined
          }
          emptyTitle={t("admin.roles.emptyEyebrow")}
          emptyDescription={t("admin.roles.emptyTitle")}
          columns={[
            {
              id: "permission",
              header: t("admin.roles.column.permission"),
              render: (row) => row.permission,
            },
            {
              id: "resource",
              header: t("admin.roles.column.resource"),
              render: (row) => row.resource,
            },
            {
              id: "action",
              header: t("admin.roles.column.action"),
              render: (row) => row.action,
            },
            ...roleCatalog.map((role) => ({
              id: role.role,
              header: role.label,
              align: "center" as const,
              render: (row: RoleRow) => (
                <UiCheckbox
                  disabled
                  checked={role.permissions.includes(row.permission)}
                  label={t("admin.roles.assignmentLabel", {
                    permission: row.permission,
                    role: role.role,
                  })}
                />
              ),
            })),
          ]}
        />
      </UiCard>
    </UiSection>
  );
};
