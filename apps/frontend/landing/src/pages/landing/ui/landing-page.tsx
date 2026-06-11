import { ProductShell, useI18n } from "@app/frontend-ui";
import { useLandingActions } from "../../../features/landing-actions";
import { ProductOverview } from "../../../widgets/product-overview";

export const LandingPage = () => {
  const { t } = useI18n();
  const actions = useLandingActions();

  return (
    <ProductShell
      actions={actions}
      appName={t("landing.productName")}
      description={t("landing.description")}
      eyebrow={t("landing.eyebrow")}
      status={t("common.status.ready")}
      statusTone="success"
      title={t("landing.title")}
    >
      <ProductOverview />
    </ProductShell>
  );
};
