import { getJestConfig } from "@storybook/test-runner";

const testRunnerConfig = getJestConfig();
const generatedAndBuildArtifacts = [
  "<rootDir>/.nx/",
  "<rootDir>/coverage/",
  "<rootDir>/dist/",
  "<rootDir>/test-results/",
];

export default {
  ...testRunnerConfig,
  modulePathIgnorePatterns: [
    ...(testRunnerConfig.modulePathIgnorePatterns ?? []),
    ...generatedAndBuildArtifacts,
  ],
  testPathIgnorePatterns: [
    ...(testRunnerConfig.testPathIgnorePatterns ?? []),
    ...generatedAndBuildArtifacts,
  ],
};
