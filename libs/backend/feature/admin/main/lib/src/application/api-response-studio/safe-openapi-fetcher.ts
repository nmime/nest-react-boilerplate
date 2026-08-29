/* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-hardcoded-ip, no-await-in-loop -- Redirect/DNS validation and explicit non-global CIDR policy are deliberately sequential and fail-closed. */
import { isIP } from 'node:net';
import type { LookupAddress, LookupOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Injectable } from '@nestjs/common';

export interface ApiResponseStudioDnsPort {
  lookup(hostname: string): Promise<readonly string[]>;
}
export interface ApiResponseStudioHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
}
export interface ApiResponseStudioHttpPort {
  request(input: {
    url: URL;
    addresses: readonly string[];
    signal: AbortSignal;
    headers: Readonly<Record<string, string>>;
  }): Promise<ApiResponseStudioHttpResponse>;
}
export interface SafeOpenApiFetcherOptions {
  readonly allowedHosts: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
}

// ipaddr.js deliberately assigns named ranges to every IANA special-purpose
// prefix. Only ordinary unicast is eligible for outbound OpenAPI retrieval;
// the explicit CIDRs below cover newer non-global allocations that older
// ipaddr.js releases may still classify as unicast.
const PublicAddressRanges = new Set(['unicast']);
const ExplicitlyNonGlobalCidrs = [
  '192.0.0.0/24',
  '192.0.2.0/24',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '2001::/32',
  '2001:2::/48',
  '2001:10::/28',
  '2001:db8::/32',
  '64:ff9b:1::/48',
  '2002::/16',
  '3fff::/20',
].map((cidr) => ipaddr.parseCIDR(cidr));
export const isPublicAddress = (value: string): boolean => {
  try {
    const address = ipaddr.process(value.split('%')[0] ?? '');
    return (
      PublicAddressRanges.has(address.range()) &&
      !ExplicitlyNonGlobalCidrs.some(([network, prefixLength]) =>
        address.kind() === network.kind() ? address.match(network, prefixLength) : false,
      )
    );
  } catch {
    return false;
  }
};

@Injectable()
export class NodeDnsPort implements ApiResponseStudioDnsPort {
  async lookup(hostname: string): Promise<readonly string[]> {
    const { lookup } = await import('node:dns/promises');
    return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  }
}

type PinnedLookupCallback = (
  error: NodeJS.ErrnoException | null,
  addressOrAddresses: string | LookupAddress[],
  family?: number,
) => void;

export const createPinnedLookup =
  (addresses: readonly string[]) =>
  (_hostname: string, options: LookupOptions, callback: PinnedLookupCallback): void => {
    const resolved = addresses.map((address) => ({ address, family: isIP(address) }));
    const requestedFamily = options.family === 4 || options.family === 6 ? options.family : undefined;
    const matching = requestedFamily ? resolved.filter((entry) => entry.family === requestedFamily) : resolved;
    if (matching.length === 0) {
      const error = new Error('No validated source address is available for the requested family.') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, options.all ? [] : '', requestedFamily);
      return;
    }
    if (options.all) {
      callback(null, matching);
      return;
    }
    const first = matching[0];
    if (!first) {
      return;
    }
    callback(null, first.address, first.family);
  };

@Injectable()
export class UndiciHttpPort implements ApiResponseStudioHttpPort {
  async request(input: {
    url: URL;
    addresses: readonly string[];
    signal: AbortSignal;
    headers: Readonly<Record<string, string>>;
  }): Promise<ApiResponseStudioHttpResponse> {
    if (input.addresses.length === 0) {
      throw new Error('No validated source address is available.');
    }
    const { Agent, request } = await import('undici');
    const dispatcher = new Agent({
      connect: {
        lookup: createPinnedLookup(input.addresses),
      },
    });
    try {
      const response = await request(input.url, {
        method: 'GET',
        headers: input.headers,
        signal: input.signal,
        dispatcher,
      });
      return {
        status: response.statusCode,
        headers: Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(', ') : value,
          ]),
        ),
        body: response.body,
      };
    } finally {
      await dispatcher.close();
    }
  }
}

const parseAllowedHosts = (): string[] =>
  (process.env['API_RESPONSE_STUDIO_ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

@Injectable()
export class SafeOpenApiFetcher {
  constructor(
    private readonly dns: ApiResponseStudioDnsPort = new NodeDnsPort(),
    private readonly http: ApiResponseStudioHttpPort = new UndiciHttpPort(),
    private readonly defaults: SafeOpenApiFetcherOptions = { allowedHosts: parseAllowedHosts() },
  ) {}

  fetchJson(urlValue: string, overrides: Partial<SafeOpenApiFetcherOptions> = {}): Promise<Record<string, unknown>> {
    return this.fetchJsonObject(urlValue, overrides, true);
  }

  fetchJsonReference(
    urlValue: string,
    overrides: Partial<SafeOpenApiFetcherOptions> = {},
  ): Promise<Record<string, unknown>> {
    return this.fetchJsonObject(urlValue, overrides, false);
  }

  private async fetchJsonObject(
    urlValue: string,
    overrides: Partial<SafeOpenApiFetcherOptions>,
    requireOpenApi: boolean,
  ): Promise<Record<string, unknown>> {
    const options = { timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, ...this.defaults, ...overrides };
    let current = this.validateUrl(urlValue, options.allowedHosts);
    for (let redirect = 0; redirect <= options.maxRedirects; redirect += 1) {
      const addresses = await this.dns.lookup(current.hostname);
      if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
        throw new Error('OpenAPI source resolves to a non-public address.');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs);
      try {
        const response = await this.http.request({
          url: current,
          addresses,
          signal: controller.signal,
          headers: { accept: 'application/json, application/vnd.oai.openapi+json' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers['location'];
          if (!location || redirect === options.maxRedirects) {
            throw new Error('OpenAPI source redirect is invalid or exceeds the limit.');
          }
          current = this.validateUrl(new URL(location, current).toString(), options.allowedHosts);
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`OpenAPI source returned HTTP ${response.status}.`);
        }
        const contentType = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';
        if (
          !['application/json', 'application/problem+json', 'application/vnd.oai.openapi+json'].includes(contentType)
        ) {
          throw new Error('OpenAPI source must return a JSON media type.');
        }
        const encoding = response.headers['content-encoding']?.trim().toLowerCase();
        if (encoding && encoding !== 'identity') {
          throw new Error('Compressed OpenAPI responses are not accepted.');
        }
        const declared = Number(response.headers['content-length'] ?? '0');
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          throw new Error('OpenAPI source exceeds the response size limit.');
        }
        const chunks: Uint8Array[] = [];
        let total = 0;
        for await (const chunk of response.body) {
          total += chunk.byteLength;
          if (total > options.maxBytes) {
            throw new Error('OpenAPI source exceeds the response size limit.');
          }
          chunks.push(chunk);
        }
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('OpenAPI source must contain a JSON object.');
        }
        const document = parsed as Record<string, unknown>;
        if (
          requireOpenApi &&
          (typeof document.openapi !== 'string' || !/^3(?:\.\d+){1,2}(?:[-+].*)?$/u.test(document.openapi))
        ) {
          throw new Error('OpenAPI 3.x document is required.');
        }
        return document;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('OpenAPI source redirect is invalid.');
  }

  private validateUrl(value: string, allowedHosts: readonly string[]): URL {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) {
      throw new Error('OpenAPI source URL must be credential-free HTTPS with no fragment or custom port.');
    }
    const hostname = url.hostname.toLowerCase();
    if (isIP(hostname) !== 0 || !allowedHosts.map((host) => host.toLowerCase()).includes(hostname)) {
      throw new Error('OpenAPI source hostname is not allowed.');
    }
    return url;
  }
}
