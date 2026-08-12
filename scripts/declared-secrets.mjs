/**
 * docker/secret-entrypoint.sh owns the single enumeration of Docker secrets: it runs inside the
 * runtime image, which has no JSON tooling, so the list cannot live in a data file the shell would
 * have to parse. Everything else — validators, parity gates — derives from it through this module
 * instead of restating the names.
 */

const manifestPattern = /^declared_secrets="\n(?<body>[\s\S]*?)^"$/mu;

/** `[{ secret, variable }]` in declaration order, parsed from the entrypoint's one manifest. */
export function parseDeclaredSecrets(entrypoint) {
  const body = manifestPattern.exec(entrypoint)?.groups?.body;
  if (!body) throw new Error('docker/secret-entrypoint.sh must declare a single `declared_secrets` manifest.');
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [secret, variable] = line.split(':');
      if (!secret || !variable) throw new Error(`Malformed declared-secret entry: ${line}`);
      return { secret, variable };
    });
}

/** Every Docker secret name a Compose file declares at its top level. */
export function composeDeclaredSecrets(composeText) {
  const names = [];
  let inSecrets = false;
  for (const line of composeText.split('\n')) {
    if (/^secrets:\s*$/u.test(line)) {
      inSecrets = true;
      continue;
    }
    if (/^\S/u.test(line)) inSecrets = false;
    if (!inSecrets) continue;
    const name = /^ {2}([a-z0-9_]+):\s*$/u.exec(line)?.[1];
    if (name) names.push(name);
  }
  return names;
}

/** Every Docker secret name a Compose file attaches to a service, in block or flow form. */
export function composeMountedSecrets(composeText) {
  const names = new Set();
  const lines = composeText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const flow = /^\s*secrets:\s*\[(?<items>[^\]]*)\]\s*$/u.exec(line);
    if (flow) {
      for (const item of flow.groups.items.split(',')) {
        const name = item.trim();
        if (name) names.add(name);
      }
      continue;
    }
    if (!/^\s+secrets:\s*$/u.test(line)) continue;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const name = /^\s+-\s+([a-z0-9_]+)\s*$/u.exec(lines[cursor] ?? '')?.[1];
      if (!name) break;
      names.add(name);
    }
  }
  return [...names];
}
