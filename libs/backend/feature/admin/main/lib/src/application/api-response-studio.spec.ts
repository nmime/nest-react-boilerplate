/* eslint-disable sonarjs/no-hardcoded-ip -- Explicit public and reserved addresses are security test fixtures. */
// @requirements REQ-API-RESPONSE-STUDIO-001 REQ-API-RESPONSE-STUDIO-002 REQ-API-RESPONSE-STUDIO-003 REQ-API-RESPONSE-STUDIO-004
import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type {
  ApiResponseStudioHttpPort,
  ApiResponseStudioHttpResponse,
  ApiResponseStudioDnsPort,
} from './api-response-studio/safe-openapi-fetcher';
import { ApiResponseStudioService } from './api-response-studio/api-response-studio.service';
import { parseOpenApiResponses } from './api-response-studio/openapi-parser';
import { SafeOpenApiFetcher, isPublicAddress } from './api-response-studio/safe-openapi-fetcher';
import {
  ApiResponseStudioValidationError,
  normalizeAndValidatePresentation,
} from './api-response-studio/text-validation';

const jsonBody = (value: unknown): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify(value));
  },
});

const bodyFrom = (...chunks: string[]): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield Buffer.from(chunk);
    }
  },
});

const response = (
  value: unknown,
  overrides: Partial<ApiResponseStudioHttpResponse> = {},
): ApiResponseStudioHttpResponse => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: jsonBody(value),
  ...overrides,
});

const createFetcher = (input?: {
  addresses?: Readonly<Record<string, readonly string[]>>;
  responses?: readonly ApiResponseStudioHttpResponse[];
}) => {
  const addresses = input?.addresses ?? { 'api.example.com': ['93.184.216.34'] };
  const dns: ApiResponseStudioDnsPort = {
    lookup: vi.fn(async (hostname: string) => addresses[hostname] ?? []),
  };
  const queue = [...(input?.responses ?? [response({ openapi: '3.0.3', paths: {} })])];
  const http: ApiResponseStudioHttpPort = {
    request: vi.fn(async () => {
      const next = queue.shift();
      if (!next) {
        throw new Error('Unexpected HTTP request.');
      }
      return next;
    }),
  };
  return {
    dns,
    fetcher: new SafeOpenApiFetcher(dns, http, { allowedHosts: Object.keys(addresses) }),
    http,
  };
};

const basePresentation = () => ({
  display: 'modal' as const,
  severity: 'warning' as const,
  support: true,
  customDescription: '',
  figmaOnly: false,
  comments: '  reviewed  ',
  texts: {
    en: [' <strong>Hello {name}</strong> '],
    ru: [' <strong>Привет {name}</strong> '],
    zh: [' <strong>你好 {name}</strong> '],
  },
});

const apiDocument = () => ({
  openapi: '3.1.0',
  paths: {
    '/health': {
      get: { responses: { 200: { description: 'health' } } },
    },
    '/v1/version': {
      get: { responses: { 200: { description: 'version noise' } } },
    },
    '/v1/widgets': {
      get: {
        operationId: 'listWidgets',
        summary: 'List widgets',
        tags: ['Widgets'],
        responses: {
          400: {
            description: 'Invalid widget',
            content: {
              'application/problem+json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/Problem' },
                    {
                      type: 'object',
                      properties: { code: { const: 'inline-problem' } },
                    },
                  ],
                },
                example: { code: 'example-problem', detail: 'Bad widget' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Problem: {
        type: 'object',
        properties: {
          code: { enum: ['b', 'a', 'c'] },
          kind: { enum: ['hard', 'soft'] },
          next: { $ref: '#/components/schemas/Problem' },
        },
      },
    },
  },
});

describe('parseOpenApiResponses', () => {
  it('resolves local references, marks cycles, expands oneOf, and ignores health and version paths', () => {
    const variants = parseOpenApiResponses(apiDocument());
    const http = variants.filter((variant) => variant.status === '400');

    expect(variants.some((variant) => variant.path === '/health')).toBe(false);
    expect(variants.some((variant) => variant.path === '/v1/version')).toBe(false);
    expect(http).toHaveLength(2);
    expect(http.map((variant) => variant.stableKey)).toEqual([
      'GET:/v1/widgets:400:example-problem',
      'GET:/v1/widgets:400:inline-problem',
    ]);
    expect(JSON.parse(http[0]!.schemaSnapshot)).toMatchObject({
      $name: 'Problem',
      properties: { next: { $circular: '#/components/schemas/Problem' } },
    });
    expect(variants.map((variant) => variant.stableKey)).toEqual(
      [...variants.map((variant) => variant.stableKey)].sort((a, b) => a.localeCompare(b)),
    );
    expect(
      variants.filter((variant) => variant.path === '/v1/widgets' && ['ERR', 'NET'].includes(variant.status)),
    ).toHaveLength(2);
  });

  it('uses persisted enum choices with a deterministic Cartesian cap', () => {
    const baseKey = 'GET:/v1/widgets:400:example-problem';
    const variants = parseOpenApiResponses(apiDocument(), {
      enumExpansionCap: 3,
      enumChoicesByBaseKey: {
        [baseKey]: [
          { property: 'code', values: ['a', 'b', 'c'], enabledValues: ['c', 'a', 'b'] },
          { property: 'kind', values: ['hard', 'soft'], enabledValues: ['soft', 'hard'] },
        ],
      },
    }).filter((variant) => variant.status === '400' && variant.enumChoices.length > 0);

    expect(variants).toHaveLength(3);
    expect(variants.map((variant) => variant.stableKey)).toEqual([
      `${baseKey}:a~hard`,
      `${baseKey}:a~soft`,
      `${baseKey}:b~hard`,
    ]);
  });

  it('truncates depth, node, and snapshot limits deterministically and rejects non-3.x documents', () => {
    const document = apiDocument();
    const first = parseOpenApiResponses(document, { maxDepth: 1, maxNodes: 3, maxSnapshotBytes: 20 });
    const second = parseOpenApiResponses(document, { maxDepth: 1, maxNodes: 3, maxSnapshotBytes: 20 });
    const schemaSnapshot = first.find((variant) => variant.status === '400')!.schemaSnapshot;

    expect(first).toEqual(second);
    expect(JSON.parse(schemaSnapshot)).toMatchObject({ $truncated: true });
    expect(() => parseOpenApiResponses({ openapi: '2.0', paths: {} })).toThrow('OpenAPI 3.x');
  });
});

describe('normalizeAndValidatePresentation', () => {
  it('accepts Cyrillic and Chinese text while trimming and preserving balanced variables and markup', () => {
    expect(normalizeAndValidatePresentation(basePresentation())).toEqual({
      ...basePresentation(),
      comments: 'reviewed',
      texts: {
        en: ['<strong>Hello {name}</strong>'],
        ru: ['<strong>Привет {name}</strong>'],
        zh: ['<strong>你好 {name}</strong>'],
      },
    });
  });

  it.each([
    [
      'variables',
      { texts: { en: ['Hello {name}'], ru: ['Привет {user}'], zh: ['你好 {name}'] } },
      'variables do not match',
    ],
    [
      'markup set',
      { texts: { en: ['<b>Hello</b>'], ru: ['<strong>Привет</strong>'], zh: ['<b>你好</b>'] } },
      'markup does not match',
    ],
    ['unbalanced markup', { texts: { en: ['<b>Hello'], ru: [], zh: [] } }, 'unbalanced markup'],
    ['unsupported markup', { texts: { en: ['<script>Hello</script>'], ru: [], zh: [] } }, 'unsupported markup'],
    ['unbalanced variable', { texts: { en: ['Hello {name'], ru: [], zh: [] } }, 'unbalanced variables'],
    ['control character', { texts: { en: ['Hello\u0007'], ru: [], zh: [] } }, 'control characters'],
  ])('rejects strict multilingual %s violations', (_name, patch, message) => {
    expect(() => normalizeAndValidatePresentation({ ...basePresentation(), ...patch })).toThrow(message);
  });

  it('enforces line, comment, description, figma-only, display, severity, and safe custom URL constraints', () => {
    const failures = [
      {
        ...basePresentation(),
        texts: { en: Array.from({ length: 9 }, (_, index) => `line-${index}`), ru: [], zh: [] },
      },
      { ...basePresentation(), texts: { en: ['x'.repeat(501)], ru: [], zh: [] } },
      { ...basePresentation(), comments: 'x'.repeat(2001) },
      { ...basePresentation(), display: 'custom' as const, customDescription: 'x'.repeat(1001) },
      { ...basePresentation(), display: 'modal' as const, figmaOnly: true },
      { ...basePresentation(), display: 'custom' as const, customDescription: 'http://example.com/design' },
      { ...basePresentation(), display: 'custom' as const, customDescription: 'https://user@example.com/design' },
      { ...basePresentation(), display: 'unsupported' as never },
      { ...basePresentation(), severity: 'unsupported' as never },
    ];

    for (const input of failures) {
      expect(() => normalizeAndValidatePresentation(input)).toThrow(ApiResponseStudioValidationError);
    }
  });
});

describe('SafeOpenApiFetcher', () => {
  it('classifies private, reserved, mapped, and public addresses fail-closed', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it.each([
    'http://api.example.com/openapi.json',
    'https://user:pass@api.example.com/openapi.json',
    'https://api.example.com:8443/openapi.json',
    'https://api.example.com/openapi.json#fragment',
    'https://93.184.216.34/openapi.json',
    'https://not-allowed.example/openapi.json',
  ])('rejects unsafe or non-allowlisted source URL %s before DNS and HTTP', async (url) => {
    const { dns, fetcher, http } = createFetcher();

    await expect(fetcher.fetchJson(url)).rejects.toBeInstanceOf(Error);
    expect(dns.lookup).not.toHaveBeenCalled();
    expect(http.request).not.toHaveBeenCalled();
  });

  it('blocks mixed public/private DNS answers before HTTP', async () => {
    const { fetcher, http } = createFetcher({
      addresses: { 'api.example.com': ['93.184.216.34', '127.0.0.1'] },
    });

    await expect(fetcher.fetchJson('https://api.example.com/openapi.json')).rejects.toThrow('non-public');
    expect(http.request).not.toHaveBeenCalled();
  });

  it('revalidates an allowlisted redirect target and refuses its private DNS answer before requesting it', async () => {
    const { dns, fetcher, http } = createFetcher({
      addresses: {
        'api.example.com': ['93.184.216.34'],
        'redirect.example.com': ['10.0.0.7'],
      },
      responses: [response(null, { status: 302, headers: { location: 'https://redirect.example.com/openapi.json' } })],
    });

    await expect(fetcher.fetchJson('https://api.example.com/openapi.json')).rejects.toThrow('non-public');
    expect(dns.lookup).toHaveBeenNthCalledWith(1, 'api.example.com');
    expect(dns.lookup).toHaveBeenNthCalledWith(2, 'redirect.example.com');
    expect(http.request).toHaveBeenCalledOnce();
  });

  it('accepts a bounded OpenAPI JSON object after an allowlisted public redirect', async () => {
    const document = { openapi: '3.0.3', paths: { '/widgets': {} } };
    const { fetcher, http } = createFetcher({
      addresses: {
        'api.example.com': ['93.184.216.34'],
        'cdn.example.com': ['203.0.113.8'],
      },
      responses: [
        response(null, { status: 307, headers: { location: 'https://cdn.example.com/openapi.json' } }),
        response(document),
      ],
    });

    await expect(fetcher.fetchJson('https://api.example.com/openapi.json')).resolves.toEqual(document);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [response(null, { status: 302, headers: {} }), 'redirect'],
    [response(null, { status: 503 }), 'HTTP 503'],
    [response({ openapi: '3.0.3' }, { headers: { 'content-type': 'text/html' } }), 'JSON media type'],
    [
      response({ openapi: '3.0.3' }, { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } }),
      'Compressed',
    ],
    [
      response({ openapi: '3.0.3' }, { headers: { 'content-type': 'application/json', 'content-length': '100' } }),
      'size limit',
    ],
    [{ status: 200, headers: { 'content-type': 'application/json' }, body: bodyFrom('123456', '789') }, 'size limit'],
    [{ status: 200, headers: { 'content-type': 'application/json' }, body: bodyFrom('{broken') }, 'Unexpected'],
    [response([]), 'JSON object'],
    [response({ swagger: '2.0' }), 'OpenAPI 3.x'],
  ] as const)(
    'rejects invalid redirect/status/type/encoding/size/JSON/OpenAPI responses',
    async (httpResponse, message) => {
      const { fetcher } = createFetcher({ responses: [httpResponse] });

      const promise = fetcher.fetchJson('https://api.example.com/openapi.json', {
        maxBytes: message === 'size limit' ? 8 : 1_000,
        maxRedirects: 0,
      });
      if (message === 'Unexpected') {
        await expect(promise).rejects.toBeInstanceOf(SyntaxError);
      } else {
        await expect(promise).rejects.toThrow(message);
      }
    },
  );

  it('aborts a timed-out deterministic request', async () => {
    const dns: ApiResponseStudioDnsPort = { lookup: vi.fn(async () => ['93.184.216.34']) };
    const http: ApiResponseStudioHttpPort = {
      request: vi.fn(
        ({ signal }) =>
          new Promise<ApiResponseStudioHttpResponse>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(new Error('aborted'));
              },
              { once: true },
            );
          }),
      ),
    };
    const fetcher = new SafeOpenApiFetcher(dns, http, { allowedHosts: ['api.example.com'] });

    await expect(fetcher.fetchJson('https://api.example.com/openapi.json', { timeoutMs: 1 })).rejects.toThrow(
      'aborted',
    );
  });
});

describe('ApiResponseStudioService executable boundaries', () => {
  it('does not persist sync variants when fetch/parsing fails', async () => {
    const repository = {
      findSource: vi.fn(() => okAsync({ jsonUrl: 'https://api.example.com/openapi.json' })),
      sync: vi.fn(() => okAsync({ source: {}, summary: {} })),
    };
    const fetcher = {
      fetchJson: vi.fn(async () => {
        throw new Error('blocked redirect');
      }),
    };
    const service = new ApiResponseStudioService(repository as never, fetcher as never);

    const result = await service.sync({
      tenantId: 'tenant-1',
      sourceId: 'source-1',
      expectedRevision: 1,
      actorUserId: 'actor-1',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'validation_error', message: 'blocked redirect' });
    expect(repository.sync).not.toHaveBeenCalled();
  });

  it('normalizes valid response updates and rejects invalid updates before persistence', async () => {
    const repository = {
      updateResponse: vi.fn((input) => okAsync(input)),
    };
    const service = new ApiResponseStudioService(repository as never, {} as never);
    const valid = basePresentation();

    const accepted = await service.updateResponse({
      tenantId: 'tenant-1',
      id: 'row-1',
      expectedRevision: 2,
      actorUserId: 'actor-1',
      presentation: valid,
    });
    expect(accepted._unsafeUnwrap()).toMatchObject({ comments: 'reviewed', tenantId: 'tenant-1' });

    const rejected = await service.updateResponse({
      tenantId: 'tenant-1',
      id: 'row-1',
      expectedRevision: 2,
      actorUserId: 'actor-1',
      presentation: { ...valid, texts: { en: ['Hello {name}'], ru: ['Привет {user}'], zh: [] } },
    });
    expect(rejected._unsafeUnwrapErr()).toMatchObject({ code: 'validation_error' });
    expect(repository.updateResponse).toHaveBeenCalledOnce();
  });

  it('exports active rows in stable-key order with deterministic content and rejects oversized output', async () => {
    const row = (stableKey: string, deleted = false, text = stableKey) => ({
      stableKey,
      deleted,
      display: 'toast',
      severity: 'error',
      support: false,
      customDescription: '',
      figmaOnly: false,
      comments: '',
      texts: { en: [text], ru: [], zh: [] },
      revision: 1,
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
      updatedByUserId: 'actor-1',
    });
    const repository = { listResponses: vi.fn(() => okAsync([row('z'), row('deleted', true), row('a')])) };
    const service = new ApiResponseStudioService(repository as never, {} as never);

    const exported = (await service.export('tenant-1', { search: 'widget' }))._unsafeUnwrap();
    expect(repository.listResponses).toHaveBeenCalledWith('tenant-1', { search: 'widget', limit: 500, offset: 0 });
    expect(exported).toEqual({
      filename: 'api-response-presentations.json',
      mediaType: 'application/json; charset=utf-8',
      content: expect.stringMatching(/^\[\n[\s\S]*"ruleId": "a"[\s\S]*"ruleId": "z"[\s\S]*\n\]\n$/u),
    });
    expect(exported.content).not.toContain('deleted');

    repository.listResponses.mockReturnValue(okAsync([row('huge', false, 'x'.repeat(2 * 1024 * 1024))]));
    const oversized = await service.export('tenant-1');
    expect(oversized._unsafeUnwrapErr()).toEqual({
      code: 'validation_error',
      message: 'Export exceeds the 2 MiB limit.',
    });
  });
});
