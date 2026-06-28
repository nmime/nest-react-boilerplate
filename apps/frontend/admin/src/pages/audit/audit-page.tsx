import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend/api-client";
import {
  UiCard,
  UiDataTable,
  UiPagination,
  UiSection,
  UiStatCard,
  UiStatusTag,
  useI18n,
} from "@app/frontend/ui";
import type { AuditRow } from "../../entities/admin-audit";
import { errorText, formatDate, pageSize, totalPages } from "../../shared";

export const AuditPage = ({
  requestOptions,
}: Readonly<{ requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
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
    <UiSection
      className="admin-page admin-audit-page"
      eyebrow={t("admin.audit.eyebrow")}
      title={t("admin.audit.title")}
    >
      <UiCard
        className="admin-command-center"
        title="Audit operations timeline"
      >
        <div className="admin-command-center__hero">
          <div>
            <p className="xr-eyebrow">Tamper-aware review</p>
            <strong>Newest events stay readable before pagination.</strong>
            <span>
              Actor, target, resource, and timestamp columns are optimized for
              incident triage and empty-state clarity.
            </span>
          </div>
          <UiStatusTag
            label={audit.error ? t("admin.health.unavailable") : "Audit stream"}
            tone={audit.error ? "warning" : "success"}
          />
        </div>
      </UiCard>
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.dashboard.summary.recentAudit")}
          value={`${audit.data?.total ?? "—"}`}
          detail={t("admin.dashboard.summary.recentAuditDetail")}
        />
      </div>
      <UiCard className="admin-table-card" title={t("admin.audit.title")}>
        <UiDataTable<AuditRow>
          rows={rows}
          rowKey={(row) => row.id}
          isLoading={audit.isLoading}
          loadingLabel={t("admin.audit.loading")}
          error={
            audit.error
              ? errorText(audit.error, "admin.audit.error.requestFailed", t)
              : undefined
          }
          emptyTitle={t("admin.audit.emptyEyebrow")}
          emptyDescription={t("admin.audit.emptyTitle")}
          columns={[
            {
              id: "action",
              header: t("admin.audit.column.action"),
              render: (row) => (
                <span className="admin-audit-action">
                  <strong>{row.action}</strong>
                  <small>{row.id}</small>
                </span>
              ),
            },
            {
              id: "resource",
              header: t("admin.audit.column.resource"),
              render: (row) => (
                <span className="admin-chip">{row.resource}</span>
              ),
            },
            {
              id: "actor",
              header: t("admin.audit.column.actor"),
              render: (row) => row.actorUserId ?? "—",
            },
            {
              id: "target",
              header: t("admin.audit.column.target"),
              render: (row) => row.targetUserId ?? "—",
            },
            {
              id: "created",
              header: t("admin.audit.column.created"),
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
      </UiCard>
    </UiSection>
  );
};
