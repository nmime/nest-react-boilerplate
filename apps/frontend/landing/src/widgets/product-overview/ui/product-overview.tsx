import { UiCard, UiSection, useI18n } from "@app/frontend-ui";
import { LandingStatCard } from "../../../shared/ui";

const includedCards = [
  {
    descriptionKey: "landing.card.api.description",
    titleKey: "landing.card.api",
  },
  {
    descriptionKey: "landing.card.frontend.description",
    titleKey: "landing.card.frontend",
  },
  {
    descriptionKey: "landing.card.ops.description",
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
] as const;

export const ProductOverview = () => {
  const { t } = useI18n();

  return (
    <UiSection
      eyebrow={t("landing.section.eyebrow")}
      title={t("landing.section.title")}
    >
      <div className="xr-card-grid" id="workspace">
        {includedCards.map((card) => (
          <UiCard key={card.titleKey} title={t(card.titleKey)}>
            {t(card.descriptionKey)}
          </UiCard>
        ))}
      </div>
      <div className="xr-stat-grid">
        {productStats.map((stat) => (
          <LandingStatCard
            detail={t(stat.detailKey)}
            key={stat.labelKey}
            label={t(stat.labelKey)}
            value={stat.value}
          />
        ))}
      </div>
    </UiSection>
  );
};
