// @requirements REQ-API-RESPONSE-STUDIO-003 REQ-API-RESPONSE-STUDIO-004
import { describe, expect, it } from 'vitest';
import { collectExternalOpenApiRefs, parseOpenApiResponses } from './openapi-parser';
import { normalizeAndValidatePresentation } from './text-validation';

const documentFor = (schema: unknown, extra: Record<string, unknown> = {}) => ({
  openapi: '3.1.0',
  paths: { '/items': { get: { responses: { 200: { content: { 'application/json': { schema } } } } } } },
  ...extra,
});
const httpRows = (document: Record<string, unknown>, options: Parameters<typeof parseOpenApiResponses>[1] = {}) =>
  parseOpenApiResponses(document, options).filter((row) => !['ERR', 'NET'].includes(row.status));
const presentation = (text: string) => ({
  display: 'custom' as const,
  severity: 'info' as const,
  support: true,
  figmaOnly: true,
  comments: '',
  customDescription: '',
  texts: { en: [text], ru: [text], zh: [text] },
});

describe('OpenAPI document boundaries', () => {
  it('merges allOf properties and required fields while ignoring malformed fragments', () => {
    const rows = httpRows(
      documentFor({
        allOf: [
          null,
          { properties: { z: { enum: [2, 1] } }, required: ['z'] },
          { properties: { a: { items: { enum: ['b', 'a'] } } }, required: ['a', 'z'] },
          { description: 'combined' },
        ],
      }),
    );
    expect(JSON.parse(rows[0]!.schemaSnapshot)).toMatchObject({
      required: ['z', 'a'],
      properties: { a: { items: { enum: ['b', 'a'] } }, z: { enum: [2, 1] } },
    });
    expect(rows[0]!.enumChoices).toEqual([
      { property: 'a[]', values: ['a', 'b'], enabledValues: [] },
      { property: 'z', values: ['1', '2'], enabledValues: [] },
    ]);
  });

  it('discovers nested enum axes and expands each enabled axis in stable order', () => {
    const schema = {
      properties: {
        nested: { properties: { z: { enum: ['2', '1'] }, a: { enum: ['y', 'x'] } } },
        union: { oneOf: [{ enum: [] }, { enum: ['b', 'a'] }] },
      },
    };
    const rows = httpRows(documentFor(schema), {
      enumChoicesByBaseKey: {
        'GET:/items:200:-': [
          { property: 'nested.z', values: ['1', '2'], enabledValues: ['2', '1', 'invalid'] },
          { property: 'nested.a', values: ['x', 'y'], enabledValues: ['y', 'x'] },
        ],
      },
    });
    expect(rows.map((row) => row.stableKey)).toEqual([
      'GET:/items:200:-:x~1',
      'GET:/items:200:-:x~2',
      'GET:/items:200:-:y~1',
      'GET:/items:200:-:y~2',
    ]);
    expect(rows[0]!.enumChoices).toContainEqual({ property: 'union.oneOf[1]', values: ['a', 'b'], enabledValues: [] });
  });

  it('accepts schema-free responses and ignores malformed path and operation entries', () => {
    expect(httpRows({ openapi: '3.1.0', paths: null })).toEqual([]);
    const rows = httpRows({
      openapi: '3.1.0',
      paths: {
        '/bad': null,
        '/items': {
          parameters: [],
          post: null,
          put: { responses: [] },
          get: {
            tags: ['z', '', 'a'],
            operationId: 1,
            summary: null,
            responses: {
              200: null,
              default: {},
              '4XX': { content: { 'text/plain': { examples: { first: { code: 'example' } } } } },
              201: { content: { 'application/json': { schema: { properties: { code: null } } } } },
            },
          },
        },
      },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.tag === 'a' && row.summary === '' && row.operationId === '')).toBe(true);
    expect(rows.map((row) => row.status)).toEqual(['201', 'default', 'default']);
    expect(rows.find((row) => row.errorType === 'example')?.exampleSnapshot).toBe('{"code":"example"}');
  });

  it('supports scalar, missing and escaped local pointers and default response discriminators', () => {
    const doc = documentFor(
      { anyOf: [{ $ref: '#/components/a~1b~0c' }, { $ref: '#/components/scalar/child' }] },
      {
        components: { 'a/b~c': { code: 'schema-error', properties: { code: { default: 'default-code' } } }, scalar: 5 },
      },
    );
    const rows = httpRows(doc);
    expect(rows.find((row) => row.errorType === 'default-code')).toBeDefined();
    expect(rows.find((row) => row.errorType === '')!.schemaSnapshot).toContain('$circular');
    expect(httpRows(documentFor(5))[0]!.schemaSnapshot).toBe('5');
    expect(httpRows(documentFor({ $ref: '#/absent' }))[0]!.schemaSnapshot).toBe('null');
  });

  it('supports external whole-document references and rejects invalid fragments and URLs', () => {
    const url = 'https://example.test/schema.json';
    expect(
      httpRows(documentFor({ $ref: url }), { externalDocuments: { [url]: { enum: ['a', 'b'] } } })[0]!.enumChoices,
    ).toEqual([{ property: '$value', values: ['a', 'b'], enabledValues: [] }]);
    expect(() => httpRows(documentFor({ $ref: `${url}#anchor` }), { externalDocuments: { [url]: {} } })).toThrow(
      'fragment is invalid',
    );
    expect(() => collectExternalOpenApiRefs({ $ref: './relative.json' })).toThrow('cannot be resolved');
    const circular: Record<string, unknown> = { refs: [{ $ref: '#anchor' }, { $ref: 'z.json' }, { $ref: 'a.json' }] };
    circular.self = circular;
    expect(collectExternalOpenApiRefs(circular, 'https://example.test/root.json')).toEqual([
      'https://example.test/a.json',
      'https://example.test/z.json',
    ]);
  });

  it('uses named discriminator enums only when valid and falls back to examples', () => {
    const schema = {
      discriminator: { propertyName: ' kind ' },
      anyOf: [
        { properties: { kind: { enum: ['valid'] } } },
        { properties: { kind: { enum: [] }, type: { example: 'fallback' } } },
      ],
    };
    expect(httpRows(documentFor(schema)).map((row) => row.errorType)).toEqual(['fallback', 'valid']);
    const invalid = {
      discriminator: { propertyName: 1 },
      oneOf: [{ properties: { type: { const: 'x' } } }, { properties: { type: { example: 'y' } } }],
    };
    expect(httpRows(documentFor(invalid)).map((row) => row.errorType)).toEqual(['x', 'y']);
  });
});

describe('Localized presentation boundaries', () => {
  it('preserves multiple placeholders and balanced tags in every language', () => {
    const input = presentation('<b>{z}</b><br><i>{a}</i><code>{nested.value}</code>');
    expect(normalizeAndValidatePresentation(input).texts).toEqual(input.texts);
    expect(
      normalizeAndValidatePresentation({ ...input, texts: { en: undefined, ru: [], zh: [] } } as never).texts.en,
    ).toEqual([]);
  });
  it.each(['<b></i>', '<b>open', '<script>x</script>', '<b class="x">x</b>'])(
    'rejects unsafe or unbalanced markup %s',
    (text) => {
      expect(() => normalizeAndValidatePresentation(presentation(text))).toThrow(/markup/);
    },
  );
  it.each(['http://example.test', 'https://user:pass@example.test', 'https://example.test/#fragment'])(
    'rejects unsafe custom URLs %s',
    (customDescription) => {
      expect(() => normalizeAndValidatePresentation({ ...presentation('text'), customDescription })).toThrow(
        'safe HTTPS',
      );
    },
  );
  it('accepts safe URLs and descriptive custom instructions', () => {
    for (const customDescription of ['https://example.test/design', 'Show a custom retry action']) {
      expect(normalizeAndValidatePresentation({ ...presentation('text'), customDescription }).customDescription).toBe(
        customDescription,
      );
    }
  });
});
