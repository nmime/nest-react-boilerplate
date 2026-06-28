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
      <UiCard className="admin-command-center" title="Tenant console runway">
        <div className="admin-command-center__hero">
          <div>
            <p className="xr-eyebrow">Multi-tenant readiness</p>
            <strong>
              Roadmap page keeps unavailable tenant actions explicit.
            </strong>
            <span>
              The route is visible only behind roles permission and presents a
              clear staged plan instead of a blank placeholder.
            </span>
          </div>
          <UiStatusTag label={t("admin.tenants.eyebrow")} tone="info" />
        </div>
      </UiCard>
      <UiEmptyState
        title={t("admin.tenants.cardTitle")}
        description={t("admin.tenants.description")}
      />
      <div className="admin-roadmap-lanes">
        {[
          ["Foundation", "Tenant profiles, branding, and domains"],
          ["Memberships", "Invitations, owners, and scoped operators"],
          ["Controls", "Tenant-specific audit, limits, and suspension"],
        ].map(([title, detail]) => (
          <UiCard className="admin-roadmap-lane" title={title} key={title}>
            <p>{detail}</p>
          </UiCard>
        ))}
      </div>
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
