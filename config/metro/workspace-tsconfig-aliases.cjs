const fs = require('node:fs');
const path = require('node:path');

function readWorkspaceAliases(workspaceRoot) {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.base.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  return Object.entries(tsconfig.compilerOptions?.paths ?? {}).flatMap(([pattern, targets]) => {
    const target = targets[0];
    return typeof target === 'string' ? [{ pattern, target }] : [];
  });
}

function resolveWorkspaceAlias(moduleName, workspaceRoot, aliases) {
  for (const { pattern, target } of aliases) {
    const wildcardIndex = pattern.indexOf('*');
    if (wildcardIndex === -1) {
      if (moduleName === pattern) {
        return path.resolve(workspaceRoot, target);
      }
      continue;
    }

    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    if (!moduleName.startsWith(prefix) || !moduleName.endsWith(suffix)) {
      continue;
    }

    const wildcard = moduleName.slice(prefix.length, moduleName.length - suffix.length || undefined);
    return path.resolve(workspaceRoot, target.replaceAll('*', wildcard));
  }
  return undefined;
}

function configureWorkspaceMetro(config, { projectRoot, workspaceRoot }) {
  const aliases = readWorkspaceAliases(workspaceRoot);
  const previousResolver = config.resolver.resolveRequest;
  const nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
    ...(config.resolver.nodeModulesPaths ?? []),
  ];

  config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
  config.resolver.nodeModulesPaths = Array.from(new Set(nodeModulesPaths));
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const aliasedModule = resolveWorkspaceAlias(moduleName, workspaceRoot, aliases);
    if (aliasedModule) {
      return context.resolveRequest(context, aliasedModule, platform);
    }
    if (typeof previousResolver === 'function') {
      return previousResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };

  return config;
}

module.exports = {
  configureWorkspaceMetro,
  readWorkspaceAliases,
  resolveWorkspaceAlias,
};
