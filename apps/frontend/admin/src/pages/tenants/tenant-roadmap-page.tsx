import { useI18n } from '@app/frontend-runtime';
import { UiEmptyState, UiSection } from '@app/frontend-ui-web';

export const TenantRoadmapPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-tenants-page"
      eyebrow={t('admin.tenants.eyebrow')}
      title={t('admin.tenants.title')}
    >
      <UiEmptyState title={t('admin.tenants.cardTitle')} description={t('admin.tenants.description')} />
    </UiSection>
  );
};
