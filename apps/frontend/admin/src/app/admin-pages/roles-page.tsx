import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/api-client";
import { UiCheckbox, UiDataTable, UiSection, useI18n } from "@app/frontend-ui";
import type { RoleRow } from "./types";
import { errorText } from "./utils";

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
  return (
    <UiSection
      eyebrow={t("admin.roles.eyebrow")}
      title={t("admin.roles.title")}
    >
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
          ...(roles.data?.roles ?? []).map((role) => ({
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
    </UiSection>
  );
};
