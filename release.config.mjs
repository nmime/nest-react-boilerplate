const supportedReleaseProviders = new Set(['github', 'gitlab']);

export const releaseNoteTypes = [
  { type: 'feat', section: 'Features' },
  { type: 'fix', section: 'Bug Fixes' },
  { type: 'perf', section: 'Performance Improvements' },
  { type: 'revert', section: 'Reverts' },
  { type: 'refactor', section: 'Code Refactoring' },
  { type: 'docs', section: 'Documentation' },
  { type: 'build', section: 'Build System' },
  { type: 'ci', section: 'Continuous Integration' },
  { type: 'test', section: 'Tests' },
  { type: 'chore', section: 'Maintenance' },
];

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
          presetConfig: {
            types: releaseNoteTypes,
          },
        },
      ],
      providerPlugin,
    ],
  };
}

export default buildReleaseConfig();
