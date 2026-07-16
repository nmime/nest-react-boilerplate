import { useI18n } from '@app/frontend-runtime';

const sitePrinciples = [
  {
    labelKey: 'site.metric.apis.label',
    detailKey: 'site.metric.apis.detail',
  },
  {
    labelKey: 'site.metric.frontends.label',
    detailKey: 'site.metric.frontends.detail',
  },
  {
    labelKey: 'site.metric.runtime.label',
    detailKey: 'site.metric.runtime.detail',
  },
] as const;

export function Page() {
  const { t } = useI18n();

  return (
    <section className="site-home" aria-labelledby="site-title">
      <div className="site-hero">
        <div className="site-hero-copy">
          <p className="site-kicker">{t('user.eyebrow')}</p>
          <h1 id="site-title">{t('site.title')}</h1>
          <p>{t('site.description')}</p>
          <div className="site-actions" aria-label={t('site.actionGroup.label')}>
            <a className="site-primary-action" href="/app">
              {t('site.action.app')}
            </a>
            <a className="site-secondary-action" href="/">
              {t('site.action.docs')}
            </a>
          </div>
        </div>
      </div>

      <div className="site-metrics" aria-label={t('site.metricGroup.label')}>
        {sitePrinciples.map((principle) => (
          <article className="site-metric" key={principle.labelKey}>
            <strong>{t(principle.labelKey)}</strong>
            <p>{t(principle.detailKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
