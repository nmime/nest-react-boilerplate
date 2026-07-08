import { useI18n } from "@app/frontend-runtime";

const siteMetrics = [
  {
    labelKey: "site.metric.apis.label",
    value: "3",
    detailKey: "site.metric.apis.detail",
  },
  {
    labelKey: "site.metric.frontends.label",
    value: "5",
    detailKey: "site.metric.frontends.detail",
  },
  {
    labelKey: "site.metric.runtime.label",
    value: "SSR",
    detailKey: "site.metric.runtime.detail",
  },
] as const;

const siteRoutes = [
  {
    href: "/app",
    labelKey: "site.route.user.label",
    detailKey: "site.route.user.detail",
  },
  {
    href: "/admin",
    labelKey: "site.route.admin.label",
    detailKey: "site.route.admin.detail",
  },
  {
    href: "/auth/docs",
    labelKey: "site.route.docs.label",
    detailKey: "site.route.docs.detail",
  },
] as const;

export function Page() {
  const { t } = useI18n();

  return (
    <section className="site-home" aria-labelledby="site-title">
      <div className="site-hero">
        <div className="site-hero-copy">
          <p className="site-kicker">{t("user.eyebrow")}</p>
          <h1 id="site-title">{t("site.title")}</h1>
          <p>{t("site.description")}</p>
          <div
            className="site-actions"
            aria-label={t("site.actionGroup.label")}
          >
            <a className="site-primary-action" href="/app">
              {t("site.action.app")}
            </a>
            <a className="site-secondary-action" href="/auth/docs">
              {t("site.action.docs")}
            </a>
          </div>
        </div>

        <div className="site-status" aria-label={t("site.status.label")}>
          <span className="site-status-dot" aria-hidden="true" />
          <span>{t("site.status.online")}</span>
          <strong>{t("user.appName")}</strong>
        </div>
      </div>

      <div className="site-metrics" aria-label={t("site.metricGroup.label")}>
        {siteMetrics.map((metric) => (
          <article className="site-metric" key={metric.labelKey}>
            <span>{t(metric.labelKey)}</span>
            <strong>{metric.value}</strong>
            <p>{t(metric.detailKey)}</p>
          </article>
        ))}
      </div>

      <div className="site-routes" aria-label={t("site.routeGroup.label")}>
        {siteRoutes.map((route) => (
          <a className="site-route" href={route.href} key={route.href}>
            <span>{t(route.labelKey)}</span>
            <p>{t(route.detailKey)}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
