const supportedReleaseProviders = new Set(['github', 'gitlab']);

export function resolveReleaseProvider(environment = process.env) {
  const configuredProvider = environment.RELEASE_PROVIDER?.trim().toLowerCase();
  const provider = configuredProvider || (environment.GITLAB_CI === 'true' ? 'gitlab' : 'github');

  if (!supportedReleaseProviders.has(provider)) {
    throw new Error(`Unsupported RELEASE_PROVIDER: ${provider}. Expected github or gitlab.`);
  }

  return provider;
}

export function buildReleaseConfig(environment = process.env) {
  const provider = resolveReleaseProvider(environment);
  const providerPlugin =
    provider === 'gitlab'
      ? [
          '@semantic-release/gitlab',
          {
            successComment: false,
          },
        ]
      : [
          '@semantic-release/github',
          {
            successComment: false,
            releasedLabels: false,
          },
        ];

  return {
    branches: ['main'],
    ...(provider === 'gitlab' && environment.CI_REPOSITORY_URL ? { repositoryUrl: environment.CI_REPOSITORY_URL } : {}),
    plugins: [
      [
        '@semantic-release/commit-analyzer',
        {
          preset: 'conventionalcommits',
        },
      ],
      [
        '@semantic-release/release-notes-generator',
        {
          preset: 'conventionalcommits',
        },
      ],
      [
        '@semantic-release/changelog',
        {
          changelogFile: 'CHANGELOG.md',
        },
      ],
      [
        '@semantic-release/git',
        {
          message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
        },
      ],
      providerPlugin,
    ],
  };
}

export default buildReleaseConfig();
