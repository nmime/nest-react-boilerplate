import {
  UiButton,
  UiCard,
  UiSection,
  type ProductShellAction,
  useI18n,
} from "@app/frontend/ui";
import { LandingStatCard } from "../../../shared/ui";

const overviewHeading =
  "A launch cockpit for teams turning the boilerplate into a production product";
const valueGridLabel = "Landing v3 product value pillars";
const featureGridLabel =
  "Platform architecture and release workflow highlights";
const actionPanelLabel = "Application route readiness";
const operationsPanelLabel = "Docs and deployment readiness";
const journeyLabel = "Implementation journey";
const routeReadiness = "Route readiness";
const readinessLabel = "Deployment readiness";
const productionPosture = "Production posture";
const routePanelHeading =
  "Explore every shipped surface without losing landing context";
const routePanelCopy =
  "The primary product app, admin console, and auth API docs stay visible as first-class smoke-test targets for every environment.";
const operationsHeading = "From clone to release, the next move is obvious";
const operationsCopy =
  "The landing page now explains what is already wired, which routes prove readiness, and which commands give teams confidence before deployment.";
const readinessHeading =
  "Designed to feel product-ready before the first sprint begins";

const valueCards = [
  {
    body: "Hero messaging, route CTAs, and deployment proof points explain the product surface in the first scan instead of only listing stack pieces.",
    marker: "01",
    heading: "Sharper launch narrative",
  },
  {
    body: "The user app, admin workspace, and auth docs are treated as a connected journey with clear responsibilities for each destination.",
    marker: "02",
    heading: "Route-aware information hierarchy",
  },
  {
    body: "CI gates, FSD boundaries, typed clients, and health-oriented defaults are surfaced as buyer-facing confidence signals.",
    marker: "03",
    heading: "Production confidence signals",
  },
  {
    body: "Responsive cards, layered panels, and dark/light-safe contrast give the starter kit a composed SaaS-quality first impression.",
    marker: "04",
    heading: "Polished responsive rhythm",
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
    meta: "install, lint, test, build, FSD, format, diff",
    name: "Release gates",
    value: "7",
  },
] as const;

const featureSections = [
  {
    eyebrowText: "Architecture",
    items: [
      "Nx project boundaries and FSD checks keep apps, widgets, features, and shared code intentional.",
      "OpenAPI-driven clients and explicit env fallbacks reduce integration drift between frontend and backend.",
      "Landing, app, admin, and docs routes remain discoverable for smoke tests and stakeholder reviews.",
    ],
    heading: "Built for real product teams",
  },
  {
    eyebrowText: "Delivery",
    items: [
      "Local and CI scripts cover dependency integrity, formatting, linting, unit tests, production builds, and changed-file checks.",
      "Container and health-check conventions make the path from workstation to deployment predictable.",
      "Readiness copy calls out docs, route coverage, and dark/light polish directly on the landing surface.",
    ],
    heading: "Release readiness from day one",
  },
] as const;

const workflowSteps = [
  {
    description:
      "Review the landing narrative, app shell links, and environment fallbacks before adding domain copy.",
    kicker: "01 / Discover",
    title: "Map the product surface",
  },
  {
    description:
      "Use shared contracts, providers, UI primitives, and translations while each frontend app keeps ownership of its routes.",
    kicker: "02 / Integrate",
    title: "Compose from the workspace",
  },
  {
    description:
      "Run install, lint, tests, build, FSD checks, formatting, and route smoke tests before opening the branch.",
    kicker: "03 / Ship",
    title: "Validate with repeatable gates",
  },
] as const;

const operationsItems = [
  {
    detail:
      "Same-origin fallback plus configurable auth API base URL keep docs reachable in local and production builds.",
    label: "/auth/docs",
    title: "Docs are deployment-aware",
  },
  {
    detail:
      "Primary and admin application routes remain the landing page's headline CTAs and smoke-test anchors.",
    label: "/app + /admin",
    title: "Product surfaces stay visible",
  },
  {
    detail:
      "The validation rail mirrors the expected branch workflow: install, lint, test, build, FSD, format, and diff checks.",
    label: "CI parity",
    title: "Quality gates are explicit",
  },
] as const;

const readinessItems = [
  "Same-origin docs fallback remains available at /auth/docs.",
  "User and admin app routes stay one click away for smoke testing.",
  "Dark and light themes inherit shared shadcn-style tokens with landing-specific depth.",
  "Static content explains deployment readiness without depending on backend availability.",
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
        data-smoke-marker="landing-v3-overview"
        eyebrow={t("landing.section.eyebrow")}
        title={overviewHeading}
      >
        <div className="landing-overview__intro">
          <p>
            Landing v3 frames the repository as a product launch system: clear
            narrative, route readiness, validation confidence, and polished
            responsive presentation in one scannable surface.
          </p>
          <div
            className="landing-overview__badges"
            aria-label="Landing v3 markers"
          >
            <span>Design v3</span>
            <span>Route-ready</span>
            <span>Deploy-aware</span>
          </div>
        </div>

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

      <section
        aria-label={featureGridLabel}
        className="landing-feature-grid"
        data-smoke-marker="landing-v3-feature-grid"
      >
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

      <section
        aria-label={journeyLabel}
        className="landing-journey"
        data-smoke-marker="landing-v3-journey"
      >
        <div className="landing-journey__header">
          <p className="landing-feature-card__eyebrow">Implementation path</p>
          <h2>Turn the starter into a shippable product in three moves</h2>
        </div>
        <div className="landing-journey__steps">
          {workflowSteps.map((step) => (
            <article className="landing-journey-card" key={step.title}>
              <p>{step.kicker}</p>
              <h3>{step.title}</h3>
              <span>{step.description}</span>
            </article>
          ))}
        </div>
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

      <section
        aria-label={operationsPanelLabel}
        className="landing-operations"
        data-smoke-marker="landing-v3-operations"
      >
        <div className="landing-operations__copy">
          <p className="landing-feature-card__eyebrow">Docs + deployment</p>
          <h2>{operationsHeading}</h2>
          <p>{operationsCopy}</p>
        </div>
        <div className="landing-operations__grid">
          {operationsItems.map((item) => (
            <article className="landing-operations-card" key={item.title}>
              <span>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

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
