import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import { UiButton, UiCard, UiToast } from "../../../shared/ui";
import type { SocialAuthIntent } from "../model";

interface SocialAuthButtonsProps {
  isDiscordPending: boolean;
  isTelegramPending: boolean;
  onDiscord: (intent: SocialAuthIntent) => void;
  onTelegramTma: (intent: SocialAuthIntent) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function SocialAuthButtons({
  isDiscordPending,
  isTelegramPending,
  onDiscord,
  onTelegramTma,
  t,
}: Readonly<SocialAuthButtonsProps>) {
  return (
    <UiCard
      title={t("auth.social.createAccount.prompt", {
        provider: t("auth.provider.telegram"),
      })}
    >
      <div className="xr-social-actions">
        <UiButton
          isLoading={isTelegramPending}
          loadingLabel={t("auth.social.status.pending", {
            provider: t("auth.provider.telegram"),
          })}
          onClick={() => onTelegramTma("login")}
          type="button"
          variant="secondary"
        >
          {t("auth.social.button.telegram")}
        </UiButton>
        <UiButton
          isLoading={isDiscordPending}
          loadingLabel={t("auth.social.status.pending", {
            provider: t("auth.provider.discord"),
          })}
          onClick={() => onDiscord("login")}
          type="button"
          variant="secondary"
        >
          {t("auth.social.button.discord")}
        </UiButton>
      </div>
      <UiToast message={t("auth.social.stepUp.required")} tone="info" />
    </UiCard>
  );
}
