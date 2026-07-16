import { useEffect, useMemo } from 'react';
import { useI18n } from '@app/frontend-runtime';
import { useSocialAuth } from '../../../features/social-auth';
import { getErrorReason } from '../../../shared/lib';
import { UiAlert, UiCard, UiLoading, UiSection, UiToast } from '../../../shared/ui';

interface AuthDiscordCallbackPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

type ValidDiscordCallbackQueryState = {
  code: string;
  state: string;
  tenantId?: string;
};

type DiscordCallbackQueryState = ValidDiscordCallbackQueryState | { tenantId?: string };

const isValidDiscordCallbackQueryState = (query: DiscordCallbackQueryState): query is ValidDiscordCallbackQueryState =>
  'code' in query && 'state' in query;

const readDiscordCallbackQuery = (): DiscordCallbackQueryState => {
  const searchParams = new URLSearchParams(globalThis.location.search);
  const code = searchParams.get('code') ?? undefined;
  const state = searchParams.get('state') ?? undefined;
  const tenantId = searchParams.get('tenantId') ?? undefined;

  return code && state ? { code, state, tenantId } : { tenantId };
};

export function AuthDiscordCallbackPage({ navigate }: Readonly<AuthDiscordCallbackPageProps>) {
  const { t } = useI18n();
  const socialAuth = useSocialAuth({ navigate });
  const query = useMemo(readDiscordCallbackQuery, []);
  const hasRequiredQuery = isValidDiscordCallbackQueryState(query);

  useEffect(() => {
    if (!hasRequiredQuery || socialAuth.discordCallbackStatus !== 'idle') {
      return;
    }

    socialAuth.completeDiscordCallback(query);
  }, [hasRequiredQuery, query, socialAuth]);

  return (
    <UiSection
      className="user-callback"
      eyebrow={t('auth.provider.discord')}
      title={t('auth.social.discord.callback.title')}
    >
      <UiCard className="user-callback__card" title={t('auth.social.discord.callback.title')}>
        {hasRequiredQuery && socialAuth.isDiscordCallbackPending ? (
          <UiAlert tone="info">
            <UiLoading label={t('auth.social.discord.callback.loading')} />
          </UiAlert>
        ) : null}
        {!hasRequiredQuery ? <UiToast message={t('auth.social.discord.callback.missingState')} tone="warning" /> : null}
        {socialAuth.discordCallbackStatus === 'success' ? (
          <UiToast message={t('auth.social.discord.callback.success')} tone="success" />
        ) : null}
        {socialAuth.discordCallbackStatus === 'error' ? (
          <UiToast
            message={getErrorReason(socialAuth.discordCallbackError, t('auth.social.discord.callback.error'))}
            tone="warning"
          />
        ) : null}
      </UiCard>
    </UiSection>
  );
}
