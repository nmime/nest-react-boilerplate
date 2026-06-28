import {
  UiCard,
  UiEmptyState,
  UiSection,
  UiStatusTag,
  useI18n,
} from "@app/frontend/ui";

export const TenantRoadmapPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-tenants-page"
      eyebrow={t("admin.tenants.eyebrow")}
      title={t("admin.tenants.title")}
    >
      <UiEmptyState
        title={t("admin.tenants.cardTitle")}
        description={t("admin.tenants.description")}
      />
      <UiCard
        className="admin-route-card"
        title={t("admin.dashboard.stat.pages.label")}
      >
        <div className="admin-readiness-grid">
          {[
            "/admin/tenants",
            "/admin/tenants/:id",
            "/admin/tenants/:id/users",
          ].map((path) => (
            <div className="admin-readiness-card" data-ready="false" key={path}>
              <div className="admin-readiness-card__header">
                <code>{path}</code>
                <UiStatusTag label={t("admin.tenants.eyebrow")} tone="info" />
              </div>
              <p>{t("admin.tenants.description")}</p>
            </div>
          ))}
        </div>
      </UiCard>
    </UiSection>
  );
};
