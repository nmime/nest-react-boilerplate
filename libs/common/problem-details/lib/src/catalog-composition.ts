const ProblemCodePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export interface ProblemTypeExtensionDefinition {
  readonly name: string;
  readonly description: string;
}

export interface ProblemTypeDefinition {
  readonly code: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly resolution: string;
  readonly extensions: readonly ProblemTypeExtensionDefinition[];
}

export function isProblemCode(value: string): boolean {
  return value.length <= 64 && ProblemCodePattern.test(value);
}

/**
 * One product's additions to the shared RFC 9457 problem catalog. Products
 * register these instead of editing the base array, so a boilerplate upgrade
 * never conflicts with a product's error taxonomy.
 */
export interface ProblemTypeExtension {
  /** Used in error messages so a misconfiguration names the extension that caused it. */
  readonly id: string;
  readonly problems: readonly ProblemTypeDefinition[];
}

export interface ProblemCatalogInput {
  readonly definitions: readonly ProblemTypeDefinition[];
  readonly extensions: readonly ProblemTypeExtension[];
}

export interface ComposedProblemCatalog {
  readonly definitions: readonly ProblemTypeDefinition[];
  readonly definitionFor: (code: string) => ProblemTypeDefinition | undefined;
}

function assertText(value: string, member: string, extensionId: string, code: string): void {
  if (value.trim() === '') {
    throw new Error(`problem extension "${extensionId}" defines problem type "${code}" without a ${member}`);
  }
}

/**
 * Folds product extensions into the base catalog.
 *
 * Every failure here is a configuration mistake that would otherwise surface as
 * an undocumented error shape at request time — an unrenderable type URI, a
 * status the HTTP layer cannot emit, or two owners disagreeing about one code —
 * so each throws at composition (module load) rather than on the failing request.
 */
export const composeProblemCatalog = ({ definitions, extensions }: ProblemCatalogInput): ComposedProblemCatalog => {
  const byCode = new Map<string, ProblemTypeDefinition>(definitions.map((entry) => [entry.code, entry]));
  const composed = [...definitions];

  for (const extension of extensions) {
    for (const problem of extension.problems) {
      if (!isProblemCode(problem.code)) {
        throw new Error(`problem extension "${extension.id}" defines an invalid problem code "${problem.code}"`);
      }
      if (byCode.has(problem.code)) {
        throw new Error(`problem extension "${extension.id}" redefines problem type "${problem.code}"`);
      }
      if (!Number.isInteger(problem.status) || problem.status < 100 || problem.status > 599) {
        throw new Error(
          `problem extension "${extension.id}" defines problem type "${problem.code}" with an out-of-range status ${problem.status}`,
        );
      }

      assertText(problem.title, 'title', extension.id, problem.code);
      assertText(problem.detail, 'detail', extension.id, problem.code);
      assertText(problem.resolution, 'resolution', extension.id, problem.code);

      byCode.set(problem.code, problem);
      composed.push(problem);
    }
  }

  return {
    definitions: composed,
    definitionFor: (code) => byCode.get(code),
  };
};
