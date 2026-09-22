export interface JavaScriptRuntimeInfo {
  name: 'node';
  version: string;
}

export function detectJavaScriptRuntime(processVersion = process.version): JavaScriptRuntimeInfo {
  return {
    name: 'node',
    version: processVersion.startsWith('v') ? processVersion.slice(1) : processVersion,
  };
}
