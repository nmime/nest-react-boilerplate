import { observer, useAuthShellStore, type TranslationKey, type TranslationParams } from '@app/frontend-runtime';
import { getErrorReason } from '../../../shared/lib';
import { UiButton, UiCard, UiEmptyState, UiLoading, UiStatusPill, UiToast } from '../../../shared/ui';
import {
  getProviderTranslationKey,
  normalizeProviderIdentities,
  SocialAuthProvider,
  socialAuthProviders,
  useProviderIdentitiesModel,
  type ProviderIdentity,
} from '../model';

interface ProviderIdentitiesPanelProps {
  onLink: (provider: SocialAuthProvider) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const unlinkButtonKey: Record<SocialAuthProvider, TranslationKey> = {
  [SocialAuthProvider.Discord]: 'auth.social.button.unlinkDiscord',
  [SocialAuthProvider.Telegram]: 'auth.social.button.unlinkTelegram',
};

const linkButtonKey: Record<SocialAuthProvider, TranslationKey> = {
  [SocialAuthProvider.Discord]: 'auth.social.button.linkDiscord',
  [SocialAuthProvider.Telegram]: 'auth.social.button.linkTelegram',
};

const getIdentityLabel = (identity: ProviderIdentity, fallback: string): string =>
  identity.email ?? identity.displayName ?? identity.username ?? identity.providerSubject ?? fallback;

const getUnlinkProviderName = (identityId: string | undefined, identities: ProviderIdentity[]) => {
  const provider = identities.find((identity) => identity.id === identityId)?.provider;
  return provider ? getProviderTranslationKey(provider) : 'auth.provider.telegram';
};

const getUnlinkErrorKey = (error: unknown): TranslationKey => {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 409) {
      return 'auth.social.lastMethod.blocked';
    }

    if (error.status === 403) {
      return 'auth.social.stepUp.required';
    }
  }

  return 'auth.social.unlink.error';
};

function ProviderIdentitiesPanelBase({ onLink, t }: Readonly<ProviderIdentitiesPanelProps>) {
  const authStore = useAuthShellStore();
  const model = useProviderIdentitiesModel();
  const { identitiesQuery, unlinkMutation } = model;
  const state = normalizeProviderIdentities(identitiesQuery.data);
  const unlinkProviderName = t(getUnlinkProviderName(unlinkMutation.variables, state.identities));

  return (
    <UiCard className="user-settings__card" title={t('user.settings.connections.title')}>
      <p>{t('user.settings.connections.description')}</p>
      {!authStore.isAuthenticated ? (
        <UiEmptyState description={t('user.state.missingToken')} title={t('user.profile.title')} />
      ) : null}
      {identitiesQuery.isLoading ? <UiLoading label={t('user.loadingProfile')} /> : null}
      {identitiesQuery.isError ? (
        <UiToast
          message={getErrorReason(
            identitiesQuery.error,
            t('auth.social.error.providerUnavailable', {
              provider: t('auth.provider.telegram'),
            }),
          )}
          tone="warning"
        />
      ) : null}
      <div className="user-provider-list">
        {socialAuthProviders.map((provider) => {
          const identity = state.providers[provider];
          const providerName = t(getProviderTranslationKey(provider));
          return (
            <section className="user-provider-row" key={provider}>
              <div>
                <div className="user-provider-row__heading">
                  <strong>{providerName}</strong>
                  <UiStatusPill label={identity ? 'linked' : 'not linked'} tone={identity ? 'success' : 'info'} />
                </div>
                <p>
                  {identity
                    ? t('auth.social.status.linked', { provider: providerName })
                    : t('auth.social.status.notLinked', {
                        provider: providerName,
                      })}
                </p>
                {identity ? <p>{getIdentityLabel(identity, t('user.profile.emailFallback'))}</p> : null}
                {identity?.isLastMethod ? <p>{t('auth.social.lastMethod.warning')}</p> : null}
              </div>
              {identity ? (
                <UiButton
                  disabled={identity.isLastMethod}
                  isLoading={unlinkMutation.isPending && unlinkMutation.variables === identity.id}
                  loadingLabel={t('auth.social.status.pending', {
                    provider: providerName,
                  })}
                  onClick={() => {
                    model.unlink(identity.id);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {t(unlinkButtonKey[provider])}
                </UiButton>
              ) : (
                <UiButton
                  onClick={() => {
                    onLink(provider);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {t(linkButtonKey[provider])}
                </UiButton>
              )}
            </section>
          );
        })}
      </div>
      {unlinkMutation.isError ? (
        <UiToast
          message={t(getUnlinkErrorKey(unlinkMutation.error), {
            provider: unlinkProviderName,
          })}
          tone="warning"
        />
      ) : null}
      {unlinkMutation.isSuccess ? (
        <UiToast
          message={t('auth.social.unlink.success', {
            provider: unlinkProviderName,
          })}
          tone="success"
        />
      ) : null}
    </UiCard>
  );
}

export const ProviderIdentitiesPanel = observer(ProviderIdentitiesPanelBase);
