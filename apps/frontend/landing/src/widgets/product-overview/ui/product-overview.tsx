import {
  UiButton,
  UiCard,
  UiSection,
  type ProductShellAction,
  useI18n,
} from "@app/frontend/ui";
import { LandingStatCard } from "../../../shared/ui";

const overviewHeading =
  "A polished starter kit for shipping secure Nest + React products";
const valueGridLabel = "Product value pillars";
const featureGridLabel = "Product architecture and deployment highlights";
const actionPanelLabel = "Application route readiness";
const routeReadiness = "Route readiness";
const readinessLabel = "Deployment readiness";
const productionPosture = "Production posture";
const routePanelHeading =
  "Explore the full stack without losing the landing context";
const routePanelCopy =
  "The primary application, admin workspace, and auth API documentation remain available through accessible links for deployment smoke tests.";
const readinessHeading =
  "Designed to feel ready before the first sprint begins";

const valueCards = [
  {
    body: "Auth, user, and admin APIs are already split by responsibility with OpenAPI contracts, health probes, and production-safe defaults.",
    marker: "01",
    heading: "Domain-ready backend surface",
  },
  {
    body: "Three React experiences share one provider stack, translations, typed clients, and a UI facade that keeps product teams moving together.",
    marker: "02",
    heading: "Composable frontend workspace",
  },
  {
    body: "Docker Compose, CI quality gates, migrations, and deployment conventions are wired so teams can validate before every release.",
    marker: "03",
    heading: "Operational runway included",
  },
] as const;

const productStats = [
  {
    meta: "auth-app-api, user-app-api, admin-app-api",
    name: "Nest APIs",
    value: "3",
  },
  {
    meta: "landing, user, and admin experiences",
    name: "React apps",
    value: "3",
  },
  {
    meta: "typed contracts, i18n, UI, config, and testing",
    name: "Shared packages",
    value: "12+",
  },
  {
    meta: "lint, tests, build, FSD boundaries, and formatting",
    name: "Quality gates",
    value: "5",
  },
] as const;

const featureSections = [
  {
    eyebrowText: "Architecture",
    items: [
      "Nx project boundaries and FSD checks keep apps, widgets, features, and shared code intentional.",
      "OpenAPI-driven clients and explicit env fallbacks reduce integration drift between frontend and backend.",
    ],
    heading: "Built for real product teams",
  },
  {
    eyebrowText: "Delivery",
    items: [
      "Local and CI scripts cover dependency integrity, formatting, linting, unit tests, and production builds.",
      "Container and health-check conventions make the path from workstation to deployment predictable.",
    ],
    heading: "Release readiness from day one",
  },
] as const;

const readinessItems = [
  "Same-origin docs fallback remains available at /auth/docs.",
  "User and admin app routes stay one click away for smoke testing.",
  "Dark and light themes inherit shared shadcn-style tokens.",
] as const;

const actionTones = [
  "Primary launch path",
  "Admin control plane",
  "API reference",
] as const;

const getActionTone = (index: number) => actionTones[index] ?? "Route check";

interface ProductOverviewProps {
  actions: ProductShellAction[];
}

export const ProductOverview = ({
  actions,
}: Readonly<ProductOverviewProps>) => {
  const { t } = useI18n();

  return (
    <div className="landing-surface" id="workspace">
      <UiSection
        className="landing-overview"
        eyebrow={t("landing.section.eyebrow")}
        title={overviewHeading}
      >
        <div className="landing-value-grid" aria-label={valueGridLabel}>
          {valueCards.map((card) => (
            <UiCard
              className="landing-value-card"
              key={card.heading}
              title={card.heading}
            >
              <span aria-hidden="true" className="landing-value-card__marker">
                {card.marker}
              </span>
              <p>{card.body}</p>
            </UiCard>
          ))}
        </div>

        <div
          aria-label={t("landing.statGrid.label")}
          className="landing-stat-grid"
        >
          {productStats.map((stat) => (
            <LandingStatCard
              className="landing-stat-card"
              detail={stat.meta}
              key={stat.name}
              label={stat.name}
              value={stat.value}
            />
          ))}
        </div>
      </UiSection>

      <section aria-label={featureGridLabel} className="landing-feature-grid">
        {featureSections.map((section) => (
          <UiCard className="landing-feature-card" key={section.heading}>
            <p className="landing-feature-card__eyebrow">
              {section.eyebrowText}
            </p>
            <h3>{section.heading}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </UiCard>
        ))}
      </section>

      <UiCard aria-label={actionPanelLabel} className="landing-action-panel">
        <div className="landing-action-panel__copy">
          <p className="landing-feature-card__eyebrow">{routeReadiness}</p>
          <h2>{routePanelHeading}</h2>
          <p>{routePanelCopy}</p>
        </div>

        <div className="landing-action-panel__grid">
          {actions.map((action, index) => (
            <UiButton
              aria-label={`${action.label}: ${getActionTone(index)}`}
              className="landing-action-panel__button"
              href={action.href}
              key={`${action.label}-${action.href}`}
              variant={index === 0 ? "primary" : "secondary"}
            >
              <span>{action.label}</span>
              <small>{getActionTone(index)}</small>
            </UiButton>
          ))}
        </div>
      </UiCard>

      <section className="landing-readiness" aria-label={readinessLabel}>
        <div>
          <p className="landing-feature-card__eyebrow">{productionPosture}</p>
          <h2>{readinessHeading}</h2>
        </div>
        <ul>
          {readinessItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
