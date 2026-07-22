import { useI18n } from '@app/frontend-runtime';
import { UiEmptyState, UiSection } from '@app/frontend-ui-web';

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-state-page"
      eyebrow={t('admin.forbidden.eyebrow')}
      headingLevel={1}
      title={t('admin.forbidden.accessDeniedTitle')}
    >
      <UiEmptyState description={reason} title={t('admin.forbidden.title')} />
    </UiSection>
  );
};
