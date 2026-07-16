/** Parse the simple KEY=VALUE format emitted in `.nrb/capabilities.env`. */
export function parseGeneratedEnvironment(content: string): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [index, rawLine] of content.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid generated environment entry on line ${index + 1}`);
    }
    const key = line.slice(0, separator);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) {
      throw new Error(`Invalid generated environment key on line ${index + 1}`);
    }
    environment[key] = line.slice(separator + 1);
  }
  return environment;
}
