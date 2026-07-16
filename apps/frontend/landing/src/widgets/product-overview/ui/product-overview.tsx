import { useI18n, type TranslationKey } from '@app/frontend-runtime';
import { UiCard, UiSection } from '@app/frontend-ui-web';

const referenceSurfaces: Array<{
  descriptionKey: TranslationKey;
  titleKey: TranslationKey;
}> = [
  {
    descriptionKey: 'landing.surface.public.description',
    titleKey: 'landing.surface.public.title',
  },
  {
    descriptionKey: 'landing.surface.account.description',
    titleKey: 'landing.surface.account.title',
  },
  {
    descriptionKey: 'landing.surface.admin.description',
    titleKey: 'landing.surface.admin.title',
  },
];

export const ProductOverview = () => {
  const { t } = useI18n();

  return (
    <UiSection className="landing-reference" eyebrow={t('landing.section.eyebrow')} title={t('landing.section.title')}>
      <p className="landing-reference__intro">{t('landing.section.description')}</p>
      <div className="landing-reference__grid" aria-label={t('landing.statGrid.label')}>
        {referenceSurfaces.map((surface, index) => (
          <UiCard className="landing-reference__card" key={surface.titleKey} title={t(surface.titleKey)}>
            <span aria-hidden="true" className="landing-reference__index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <p>{t(surface.descriptionKey)}</p>
          </UiCard>
        ))}
      </div>
    </UiSection>
  );
};
