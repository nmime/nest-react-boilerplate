// @requirements REQ-API-PROBLEM-001
// Evidence for: REQ-API-PROBLEM-001
import { describe, expect, it } from 'vitest';
import { composeProblemCatalog, type ProblemTypeExtension } from './catalog-composition';
import {
  ProblemTypeDefinitions,
  getProblemTypeDefinition,
  problemCodeFromType,
  problemTypeForCode,
  registerProblemTypes,
  registeredProblemCodeFromType,
  registeredProblemTypeDefinitions,
  type ProblemTypeDefinition,
} from './index';

const productProblem: ProblemTypeDefinition = {
  code: 'provider-unavailable',
  title: 'Provider Unavailable',
  status: 503,
  detail: 'The requested provider capability is temporarily unavailable or disabled.',
  resolution: 'Retry only when the disclosed capability state reports the provider as retryable.',
  extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
};

const extension = (problems: readonly ProblemTypeDefinition[], id = 'product'): ProblemTypeExtension => ({
  id,
  problems,
});

describe('composeProblemCatalog', () => {
  it('keeps the base catalog when no product registers anything', () => {
    const catalog = composeProblemCatalog({ definitions: ProblemTypeDefinitions, extensions: [] });

    expect(catalog.definitions).toEqual([...ProblemTypeDefinitions]);
    expect(catalog.definitionFor('resource-not-found')?.status).toBe(404);
    expect(catalog.definitionFor('provider-unavailable')).toBeUndefined();
  });

  it('appends product problem types without editing the base catalog', () => {
    const catalog = composeProblemCatalog({
      definitions: ProblemTypeDefinitions,
      extensions: [extension([productProblem])],
    });

    expect(catalog.definitionFor('provider-unavailable')).toEqual(productProblem);
    expect(catalog.definitions).toHaveLength(ProblemTypeDefinitions.length + 1);
  });

  it('refuses to redefine a base problem type', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, code: 'rate-limited' }])],
      }),
    ).toThrow('redefines problem type "rate-limited"');
  });

  it('refuses to redefine a problem type another extension already added', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([productProblem], 'first'), extension([productProblem], 'second')],
      }),
    ).toThrow('extension "second" redefines problem type "provider-unavailable"');
  });

  it('refuses a code that cannot be rendered as a problem type URI', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, code: 'Provider Unavailable' }])],
      }),
    ).toThrow('invalid problem code');
  });

  it('refuses a status outside the HTTP range', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, status: 99 }])],
      }),
    ).toThrow('status');
  });

  it('refuses a definition without a title', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, title: '  ' }])],
      }),
    ).toThrow('title');
  });

  it('refuses a definition without a resolution, since the catalog documents recovery', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, resolution: '' }])],
      }),
    ).toThrow('resolution');
  });

  it('refuses a definition without a detail', () => {
    expect(() =>
      composeProblemCatalog({
        definitions: ProblemTypeDefinitions,
        extensions: [extension([{ ...productProblem, detail: '' }])],
      }),
    ).toThrow('detail');
  });
});

describe('problem type registry', () => {
  it('does not know a product problem type until it is registered', () => {
    expect(getProblemTypeDefinition('provider-unavailable')).toBeUndefined();
  });

  it('exposes registered product problem types to every consumer of the registry', () => {
    registerProblemTypes(extension([productProblem], 'registry-test'));

    expect(getProblemTypeDefinition('provider-unavailable')).toEqual(productProblem);
    expect(registeredProblemTypeDefinitions()).toContainEqual(productProblem);
    expect(registeredProblemCodeFromType(problemTypeForCode('provider-unavailable'))).toBe('provider-unavailable');
    expect(registeredProblemCodeFromType('https://example.com/problems#nothing')).toBeUndefined();
  });

  it('keeps the base catalog and its narrow code union untouched', () => {
    expect(ProblemTypeDefinitions).toHaveLength(6);
    expect(problemCodeFromType(problemTypeForCode('provider-unavailable'))).toBeUndefined();
  });

  it('refuses a second registration under the same extension id', () => {
    expect(() => registerProblemTypes(extension([productProblem], 'registry-test'))).toThrow('already registered');
  });

  it('leaves the registry unchanged when an extension is rejected', () => {
    expect(() => registerProblemTypes(extension([{ ...productProblem, code: 'rate-limited' }], 'broken'))).toThrow();
    expect(() => registerProblemTypes(extension([productProblem], 'later'))).toThrow('redefines');
  });
});
