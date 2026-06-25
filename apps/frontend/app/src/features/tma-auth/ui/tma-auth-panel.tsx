import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import { getErrorReason } from "../../../shared/lib";
import { UiCard, UiLoading, UiToast } from "../../../shared/ui";

interface TmaAuthPanelProps {
  error: unknown;
  isTelegram: boolean;
  isVerifying: boolean;
  status: string;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function TmaAuthPanel({
  error,
  isTelegram,
  isVerifying,
  status,
  t,
}: Readonly<TmaAuthPanelProps>) {
  return (
    <UiCard title={t("tma.loading")}>
      {!isTelegram ? (
        <UiToast message={t("tma.unsupported")} tone="warning" />
      ) : null}
      {isVerifying ? <UiLoading label={t("tma.loading")} /> : null}
      {isTelegram && status === "idle" && !isVerifying ? (
        <UiToast message={t("tma.idle")} tone="info" />
      ) : null}
      {status === "success" ? (
        <UiToast message={t("tma.authenticated")} tone="success" />
      ) : null}
      {status === "error" ? (
        <UiToast
          message={getErrorReason(
            error,
            t("auth.social.error.invalidCallback", {
              provider: t("auth.provider.telegram"),
            }),
          )}
          tone="warning"
        />
      ) : null}
    </UiCard>
  );
}
