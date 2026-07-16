import { observer, useI18n } from '@app/frontend-runtime';
import { ProductShell } from '@app/frontend-ui-web';
import { useLandingActionsState } from '../../../features/landing-actions';
import { ProductOverview } from '../../../widgets/product-overview';

export const LandingPage = observer(function LandingPage() {
  const { t } = useI18n();
  const { actions } = useLandingActionsState();

  return (
    <ProductShell
      actions={actions}
      appName={t('landing.productName')}
      description={t('landing.description')}
      eyebrow={t('landing.eyebrow')}
      title={t('landing.title')}
    >
      <ProductOverview />
    </ProductShell>
  );
});
