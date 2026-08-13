// The three shapes a bundler leaves behind. The bare `import 'pkg'` alternative has to come last:
// the two before it are the same prefix followed by more, and the first alternative that matches
// wins. Rolldown emits that bare shape for an external package a bundled module imported only for
// its side effects, and the package is just as installed-or-crash as one behind a `from` clause.
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/gu;

const packageNameOf = (specifier) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

/**
 * The packages a bundle still needs from `node_modules` once it runs, read off the import
 * specifiers the bundler left in the output.
 */
export function collectRuntimePackages(sourceText) {
  const specifiers = [...sourceText.matchAll(IMPORT_SPECIFIER)].map(([, , specifier]) => specifier);

  return [
    ...new Set(
      specifiers.filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:')).map(packageNameOf),
    ),
  ].sort();
}
