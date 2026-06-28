import { useEffect, useRef } from "react";
import type { TranslationKey, TranslationParams } from "@app/frontend/ui";
import {
  UiAlert,
  UiButton,
  UiCard,
  UiStatusPill,
  UiToast,
} from "../../../shared/ui";
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
  const telegramClickGuard = useRef(false);
  const discordClickGuard = useRef(false);

  useEffect(() => {
    if (!isTelegramPending) {
      telegramClickGuard.current = false;
    }
  }, [isTelegramPending]);

  useEffect(() => {
    if (!isDiscordPending) {
      discordClickGuard.current = false;
    }
  }, [isDiscordPending]);

  const handleTelegramTma = () => {
    if (isTelegramPending || telegramClickGuard.current) {
      return;
    }
    telegramClickGuard.current = true;
    onTelegramTma("login");
  };

  const handleDiscord = () => {
    if (isDiscordPending || discordClickGuard.current) {
      return;
    }
    discordClickGuard.current = true;
    onDiscord("login");
  };

  return (
    <UiCard
      className="xr-social-card xr-surface-glow"
      title={t("auth.social.createAccount.prompt", {
        provider: t("auth.provider.telegram"),
      })}
    >
      <UiAlert className="xr-card-note" tone="info">
        <span>{t("auth.social.stepUp.required")}</span>
        <UiStatusPill label={t("auth.social.protocol.oauth")} tone="info" />
      </UiAlert>
      <div className="xr-social-actions">
        <UiButton
          isLoading={isTelegramPending}
          loadingLabel={t("auth.social.status.pending", {
            provider: t("auth.provider.telegram"),
          })}
          onClick={handleTelegramTma}
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
          onClick={handleDiscord}
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
