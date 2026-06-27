import { useI18n, type ProductShellAction } from "@app/frontend/ui";
import { getLandingFrontendEnv, landingRoutes } from "../../../shared/config";
import { getAuthApiDocsHref } from "./get-auth-api-docs-href";

export interface LandingActionsState {
  actions: ProductShellAction[];
  fallbackNotice?: string;
}

const getSafeAuthApiDocsHref = (): Pick<
  LandingActionsState,
  "fallbackNotice"
> & { href: string } => {
  try {
    return { href: getAuthApiDocsHref(getLandingFrontendEnv()) };
  } catch {
    return {
      fallbackNotice:
        "API docs configuration is using the same-origin fallback.",
      href: landingRoutes.authDocs,
    };
  }
};

export const useLandingActionsState = (): LandingActionsState => {
  const { t } = useI18n();
  const docs = getSafeAuthApiDocsHref();

  const actions: ProductShellAction[] = [
    { href: landingRoutes.userApp, label: t("landing.action.user") },
    {
      href: landingRoutes.adminApp,
      label: t("landing.action.admin"),
      variant: "secondary",
    },
    {
      href: docs.href,
      label: t("landing.action.docs"),
      variant: "secondary",
    },
  ];

  return {
    actions,
    fallbackNotice: docs.fallbackNotice,
  };
};

export const useLandingActions = (): ProductShellAction[] =>
  useLandingActionsState().actions;
