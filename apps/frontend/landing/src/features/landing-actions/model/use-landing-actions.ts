import { useI18n, type ProductShellAction } from "@app/frontend-ui";
import { getLandingFrontendEnv, landingRoutes } from "../../../shared/config";
import { getAuthApiDocsHref } from "./get-auth-api-docs-href";

export const useLandingActions = (): ProductShellAction[] => {
  const { t } = useI18n();

  return [
    { href: landingRoutes.userApp, label: t("landing.action.user") },
    {
      href: landingRoutes.adminApp,
      label: t("landing.action.admin"),
      variant: "secondary",
    },
    {
      href: getAuthApiDocsHref(getLandingFrontendEnv()),
      label: t("landing.action.docs"),
      variant: "secondary",
    },
  ];
};
