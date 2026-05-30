export interface ParsedArgs {
  flags: Set<string>;
  options: Map<string, string>;
  positional: string[];
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv.at(index);

    if (value === undefined) {
      continue;
    }

    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const raw = value.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex >= 0) {
      options.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }

    const next = argv.at(index + 1);

    if (next !== undefined && !next.startsWith("--")) {
      options.set(raw, next);
      index += 1;
    } else {
      flags.add(raw);
    }
  }

  return { flags, options, positional };
}
