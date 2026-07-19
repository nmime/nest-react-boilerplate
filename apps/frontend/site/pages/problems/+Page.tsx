import { ProblemTypeDefinitions, ProblemTypeDocumentationUrl, problemTypeForCode } from '@app/common-problem-details';
import { useI18n } from '@app/frontend-runtime';

export function Page() {
  const { t } = useI18n();

  return (
    <section className="problem-registry" aria-labelledby="problem-registry-title">
      <p className="site-kicker">{t('site.problems.kicker')}</p>
      <h1 id="problem-registry-title">{t('site.problems.title')}</h1>
      <p className="problem-registry-intro">
        {t('site.problems.intro')} <code>{ProblemTypeDocumentationUrl}</code>. {t('site.problems.instanceDetail')}
      </p>

      <article className="problem-card" id="about-blank">
        <h2>
          <code>about:blank</code>
        </h2>
        <p>{t('site.problems.aboutBlank')}</p>
      </article>

      {ProblemTypeDefinitions.map((problem) => (
        <article className="problem-card" id={problem.code} key={problem.code}>
          <h2>{problem.title}</h2>
          <code>{problemTypeForCode(problem.code)}</code>
          <dl>
            <dt>{t('site.problems.status')}</dt>
            <dd>{problem.status}</dd>
            <dt>{t('site.problems.meaning')}</dt>
            <dd>{problem.detail}</dd>
            <dt>{t('site.problems.resolution')}</dt>
            <dd>{problem.resolution}</dd>
            <dt>{t('site.problems.extensions')}</dt>
            <dd>
              <ul>
                {problem.extensions.map((extension) => (
                  <li key={extension.name}>
                    <code>{extension.name}</code> — {extension.description}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        </article>
      ))}
    </section>
  );
}
