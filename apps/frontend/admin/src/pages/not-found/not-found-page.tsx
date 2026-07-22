import { useI18n } from '@app/frontend-runtime';
import { UiEmptyState, UiSection } from '@app/frontend-ui-web';

export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-state-page"
      eyebrow={t('admin.notFound.eyebrow')}
      headingLevel={1}
      title={t('admin.notFound.sectionTitle')}
    >
      <UiEmptyState description={t('admin.notFound.description')} title={t('admin.notFound.title')} />
    </UiSection>
  );
};
