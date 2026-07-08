const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../..");
const config = getDefaultConfig(projectRoot);

const nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  ...(config.resolver.nodeModulesPaths ?? []),
];

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot]),
);
config.resolver.nodeModulesPaths = Array.from(new Set(nodeModulesPaths));
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@app/common-design-tokens": path.resolve(
    workspaceRoot,
    "libs/common/design-tokens/lib/src",
  ),
  "@app/frontend-ui-native": path.resolve(
    workspaceRoot,
    "libs/frontend/ui-native/lib/src",
  ),
};

module.exports = config;
