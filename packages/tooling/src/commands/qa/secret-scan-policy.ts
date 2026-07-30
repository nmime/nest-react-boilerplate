const generatedToastRulePathSuffix = ".toast-rules.generated.json";
const generatedToastVariantPattern =
  /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)_(?:[1-5]\d{2}|ERR|NET)(?:_[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/u;

export function secretValueEntropy(value: string) {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / value.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

export function isAllowedSecretScanValue(value: string, relativePath = "") {
  if (value.includes("${")) return true;
  if (/example|sample|fixture|test|dummy|changeme|placeholder|process\.env/i.test(value)) return true;
  if (relativePath.endsWith("env-loader.ts") && /postgres/i.test(value)) return true;
  if (relativePath === "scripts/validate-deployment-config.mjs" && value.startsWith("SITE_DIST_ROOT=/workspace/")) return true;
  if (relativePath.endsWith(generatedToastRulePathSuffix) && generatedToastVariantPattern.test(value)) return true;
  return false;
}

export function isSecretScanIgnoredPath(relativePath: string) {
  return relativePath === ".claude/worktrees" || relativePath.startsWith(".claude/worktrees/");
}
