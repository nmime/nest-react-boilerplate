import { useI18n } from '@app/frontend-runtime';
import { UiButton, UiEmptyState, UiSection } from '../../../shared/ui';

/**
 * Terminal state for unmatched URLs. Uses the shared `errors.not-found.*` copy
 * so it carries no product- or demo-specific wording.
 */
export const NotFoundPage = () => {
  const { t } = useI18n();

  return (
    <UiSection
      className="user-page-stack"
      eyebrow={t('user.eyebrow')}
      headingLevel={1}
      title={t('errors.not-found.title')}
    >
      <UiEmptyState
        action={
          <UiButton href="/" variant="secondary">
            {t('user.nav.home')}
          </UiButton>
        }
        description={t('errors.not-found.detail')}
        title={t('errors.not-found.title')}
      />
    </UiSection>
  );
};
