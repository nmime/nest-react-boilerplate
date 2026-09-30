import { usePageContext } from 'vike-react/usePageContext';
import { useI18n } from '@app/frontend-runtime';

export function Page() {
  const { is404 } = usePageContext();
  const { t } = useI18n();
  const prefix = is404 ? 'errors.not-found' : 'errors.internal-server-error';
  return (
    <section className="site-home" aria-labelledby="site-error-title">
      <h1 id="site-error-title">{t(`${prefix}.title`)}</h1>
      <p>{t(`${prefix}.detail`)}</p>
      <a className="site-primary-action" href="/">
        {t('common.navigation.home', { appName: t('user.appName') })}
      </a>
    </section>
  );
}
