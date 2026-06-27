import type { TranslationKey, TranslationParams } from "@app/frontend/ui";
import { getErrorReason } from "../../../shared/lib";
import { UiCard, UiLoading, UiToast } from "../../../shared/ui";
import type { TmaDeepNavigationState, TmaLaunchIntent } from "../model";

interface TmaAuthPanelProps {
  deepNavigationState: TmaDeepNavigationState;
  error: unknown;
  intent: TmaLaunchIntent;
  isTelegram: boolean;
  isVerifying: boolean;
  status: string;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const getDeepNavigationMessageKey = (
  state: TmaDeepNavigationState,
): TranslationKey | null => {
  if (state === "loading") {
    return "tma.deepNavigation.loading";
  }

  if (state === "not-found") {
    return "tma.deepNavigation.notFound";
  }

  if (state === "unsupported") {
    return "tma.deepNavigation.unsupported";
  }

  return null;
};

export function TmaAuthPanel({
  deepNavigationState,
  error,
  intent,
  isTelegram,
  isVerifying,
  status,
  t,
}: Readonly<TmaAuthPanelProps>) {
  const isLinkIntent = intent === "link";
  const deepNavigationMessageKey =
    getDeepNavigationMessageKey(deepNavigationState);

  return (
    <UiCard title={t("tma.loading")}>
      {!isTelegram ? (
        <UiToast message={t("tma.unsupported")} tone="warning" />
      ) : null}
      {deepNavigationMessageKey ? (
        <UiToast
          message={t(deepNavigationMessageKey)}
          tone={deepNavigationState === "not-found" ? "warning" : "info"}
        />
      ) : null}
      {isVerifying ? <UiLoading label={t("tma.loading")} /> : null}
      {isTelegram && status === "idle" && !isVerifying ? (
        <UiToast
          message={t(isLinkIntent ? "tma.link.pending" : "tma.idle")}
          tone="info"
        />
      ) : null}
      {status === "success" ? (
        <UiToast
          message={t(isLinkIntent ? "tma.link.success" : "tma.authenticated")}
          tone="success"
        />
      ) : null}
      {status === "error" ? (
        <UiToast
          message={getErrorReason(
            error,
            t(
              isLinkIntent
                ? "tma.link.error"
                : "auth.social.error.invalidCallback",
              {
                provider: t("auth.provider.telegram"),
              },
            ),
          )}
          tone="warning"
        />
      ) : null}
    </UiCard>
  );
}
