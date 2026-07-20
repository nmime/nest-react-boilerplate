export interface JavaScriptRuntimeInfo {
  name: 'bun' | 'node';
  version: string;
  nodeCompatibilityVersion?: string;
}

export interface JavaScriptRuntimeVersions {
  bun?: string;
  node?: string;
}

export function detectJavaScriptRuntime(
  versions: JavaScriptRuntimeVersions = process.versions,
  processVersion = process.version,
): JavaScriptRuntimeInfo {
  const bunVersion = versions.bun?.trim();
  if (bunVersion) {
    return {
      name: 'bun',
      version: bunVersion,
      ...(versions.node ? { nodeCompatibilityVersion: versions.node } : {}),
    };
  }

  return {
    name: 'node',
    version: processVersion.startsWith('v') ? processVersion.slice(1) : processVersion,
  };
}
