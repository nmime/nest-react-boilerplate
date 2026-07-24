import { useEffect, useRef } from 'react';
import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { UiButton, UiCard } from '../../../shared/ui';
import type { SocialAuthIntent } from '@app/frontend-feature-user-social-auth';

interface SocialAuthButtonsProps {
  isDiscordPending: boolean;
  isTelegramPending: boolean;
  isTelegramEnabled: boolean;
  onDiscord: (intent: SocialAuthIntent) => void;
  onTelegram: (intent: SocialAuthIntent) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function SocialAuthButtons({
  isDiscordPending,
  isTelegramPending,
  isTelegramEnabled,
  onDiscord,
  onTelegram,
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
    onTelegram('login');
  };

  const handleDiscord = () => {
    if (isDiscordPending || discordClickGuard.current) {
      return;
    }
    discordClickGuard.current = true;
    onDiscord('login');
  };

  return (
    <UiCard className="user-auth__card user-auth__social" title={t('user.auth.social.title')}>
      <p>{t('user.auth.social.description')}</p>
      <div className="user-auth__social-actions">
        {isTelegramEnabled ? (
          <UiButton
            isLoading={isTelegramPending}
            loadingLabel={t('auth.social.status.pending', {
              provider: t('auth.provider.telegram'),
            })}
            onClick={handleTelegramTma}
            type="button"
            variant="secondary"
          >
            {t('auth.social.button.telegram')}
          </UiButton>
        ) : null}
        <UiButton
          isLoading={isDiscordPending}
          loadingLabel={t('auth.social.status.pending', {
            provider: t('auth.provider.discord'),
          })}
          onClick={handleDiscord}
          type="button"
          variant="secondary"
        >
          {t('auth.social.button.discord')}
        </UiButton>
      </div>
    </UiCard>
  );
}
