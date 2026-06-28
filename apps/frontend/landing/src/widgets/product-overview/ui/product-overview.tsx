import {
  UiButton,
  UiCard,
  UiSection,
  type ProductShellAction,
  useI18n,
} from "@app/frontend/ui";
import { LandingStatCard } from "../../../shared/ui";

const valueCards = [
  {
    description:
      "Auth, user, and admin APIs are already split by responsibility with OpenAPI contracts, health probes, and production-safe defaults.",
    marker: "01",
    title: "Domain-ready backend surface",
  },
  {
    description:
      "Three React experiences share one provider stack, translations, typed clients, and a UI facade that keeps product teams moving together.",
    marker: "02",
    title: "Composable frontend workspace",
  },
  {
    description:
      "Docker Compose, CI quality gates, migrations, and deployment conventions are wired so teams can validate before every release.",
    marker: "03",
    title: "Operational runway included",
  },
] as const;

const productStats = [
  {
    detail: "auth-app-api, user-app-api, admin-app-api",
    label: "Nest APIs",
    value: "3",
  },
  {
    detail: "landing, user, and admin experiences",
    label: "React apps",
    value: "3",
  },
  {
    detail: "typed contracts, i18n, UI, config, and testing",
    label: "Shared packages",
    value: "12+",
  },
  {
    detail: "lint, tests, build, FSD boundaries, and formatting",
    label: "Quality gates",
    value: "5",
  },
] as const;

const featureSections = [
  {
    eyebrow: "Architecture",
    items: [
      "Nx project boundaries and FSD checks keep apps, widgets, features, and shared code intentional.",
      "OpenAPI-driven clients and explicit env fallbacks reduce integration drift between frontend and backend.",
    ],
    title: "Built for real product teams",
  },
  {
    eyebrow: "Delivery",
    items: [
      "Local and CI scripts cover dependency integrity, formatting, linting, unit tests, and production builds.",
      "Container and health-check conventions make the path from workstation to deployment predictable.",
    ],
    title: "Release readiness from day one",
  },
] as const;

const readinessItems = [
  "Same-origin docs fallback remains available at /auth/docs.",
  "User and admin app routes stay one click away for smoke testing.",
  "Dark and light themes inherit shared shadcn-style tokens.",
] as const;

interface ProductOverviewProps {
  actions: ProductShellAction[];
}

const actionTones = [
  "Primary launch path",
  "Admin control plane",
  "API reference",
] as const;

const getActionTone = (index: number) => actionTones[index] ?? "Route check";

export const ProductOverview = ({
  actions,
}: Readonly<ProductOverviewProps>) => {
  const { t } = useI18n();

  return (
    <div className="landing-surface" id="workspace">
      <UiSection
        className="landing-overview"
        eyebrow={t("landing.section.eyebrow")}
        title="A polished starter kit for shipping secure Nest + React products"
      >
        <div className="landing-value-grid" aria-label="Product value pillars">
          {valueCards.map((card) => (
            <UiCard
              className="landing-value-card"
              key={card.title}
              title={card.title}
            >
              <span aria-hidden="true" className="landing-value-card__marker">
                {card.marker}
              </span>
              <p>{card.description}</p>
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
              detail={stat.detail}
              key={stat.label}
              label={stat.label}
              value={stat.value}
            />
          ))}
        </div>
      </UiSection>

      <section
        aria-label="Product architecture and deployment highlights"
        className="landing-feature-grid"
      >
        {featureSections.map((section) => (
          <UiCard className="landing-feature-card" key={section.title}>
            <p className="landing-feature-card__eyebrow">{section.eyebrow}</p>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </UiCard>
        ))}
      </section>

      <UiCard
        aria-label="Application route readiness"
        className="landing-action-panel"
      >
        <div className="landing-action-panel__copy">
          <p className="landing-feature-card__eyebrow">Route readiness</p>
          <h2>Explore the full stack without losing the landing context</h2>
          <p>
            The primary application, admin workspace, and auth API documentation
            remain available through accessible links for deployment smoke
            tests.
          </p>
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

      <section className="landing-readiness" aria-label="Deployment readiness">
        <div>
          <p className="landing-feature-card__eyebrow">Production posture</p>
          <h2>Designed to feel ready before the first sprint begins</h2>
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
