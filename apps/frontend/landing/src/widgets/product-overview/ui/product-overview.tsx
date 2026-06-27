import {
  UiButton,
  UiCard,
  UiEmptyState,
  UiSection,
  type ProductShellAction,
  useI18n,
} from "@app/frontend/ui";
import { LandingStatCard } from "../../../shared/ui";

const includedCards = [
  {
    descriptionKey: "landing.card.api.description",
    marker: "01",
    titleKey: "landing.card.api",
  },
  {
    descriptionKey: "landing.card.frontend.description",
    marker: "02",
    titleKey: "landing.card.frontend",
  },
  {
    descriptionKey: "landing.card.ops.description",
    marker: "03",
    titleKey: "landing.card.ops",
  },
] as const;

const productStats = [
  {
    detailKey: "landing.stat.apis.detail",
    labelKey: "landing.stat.apis",
    value: "3",
  },
  {
    detailKey: "landing.stat.apps.detail",
    labelKey: "landing.stat.apps",
    value: "3",
  },
  {
    detailKey: "landing.section.eyebrow",
    labelKey: "landing.stat.libs",
    value: "∞",
    valueLabel: "shared libraries",
  },
] as const;

interface ProductOverviewProps {
  actions: ProductShellAction[];
}

export const ProductOverview = ({
  actions,
}: Readonly<ProductOverviewProps>) => {
  const { t } = useI18n();

  return (
    <UiSection
      className="landing-overview"
      eyebrow={t("landing.section.eyebrow")}
      title={t("landing.section.title")}
    >
      <div className="landing-overview__grid" id="workspace">
        {includedCards.map((card) => (
          <UiCard
            className="landing-overview__card"
            key={card.titleKey}
            title={t(card.titleKey)}
          >
            <span aria-hidden="true" className="landing-overview__marker">
              {card.marker}
            </span>
            <p>{t(card.descriptionKey)}</p>
          </UiCard>
        ))}
      </div>
      <div
        aria-label="Product foundation statistics"
        className="landing-stat-grid"
      >
        {productStats.map((stat) => (
          <LandingStatCard
            className="landing-stat-card"
            detail={t(stat.detailKey)}
            key={stat.labelKey}
            label={t(stat.labelKey)}
            value={stat.value}
            valueLabel={"valueLabel" in stat ? stat.valueLabel : undefined}
          />
        ))}
      </div>
      <UiCard className="landing-action-panel" title={t("common.status.ready")}>
        {actions.length > 0 ? (
          <div className="landing-action-panel__grid">
            {actions.map((action) => (
              <UiButton
                className="landing-action-panel__button"
                href={action.href}
                key={`${action.label}-${action.href}`}
                variant={action.variant}
              >
                {action.label}
              </UiButton>
            ))}
          </div>
        ) : (
          <UiEmptyState
            description={t("common.loading")}
            title={t("common.status.ready")}
          />
        )}
      </UiCard>
    </UiSection>
  );
};
