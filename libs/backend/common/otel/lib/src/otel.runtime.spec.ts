// @requirements REQ-RUNTIME-OBSERVABILITY-005
import { execFile } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ReceivedRequest {
  body: Buffer;
  headers: IncomingHttpHeaders;
  method?: string;
  url?: string;
}

interface ExportedResource {
  scopeSpans: { scope: { name: string }; spans: unknown[] }[];
}

const execFileAsync = promisify(execFile);

describe('OpenTelemetry runtime export', () => {
  it('keeps credential-bearing automatic HTTP and provider attributes out of real OTLP payloads', async () => {
    const payloads: string[] = [];
    const receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        if (request.url === '/v1/traces') {
          payloads.push(Buffer.concat(chunks).toString('utf8'));
        }
        response.writeHead(200, { connection: 'close' });
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') {
      throw new Error('Receiver did not bind a TCP port');
    }
    try {
      const factory = fileURLToPath(new URL('./factory/otel-sdk-config.factory.ts', import.meta.url));
      const endpoint = `http://127.0.0.1:${address.port}`;
      const runtimeProof = `
        const { createJiti } = require('jiti');
        const jiti = createJiti(process.cwd() + '/otel-privacy-proof.cjs');
        (async () => {
          const { createOpenTelemetrySdkConfig } = await jiti.import(process.argv[1]);
          const { NodeSDK } = require('@opentelemetry/sdk-node');
          const sdk = new NodeSDK(createOpenTelemetrySdkConfig({ serviceName: 'privacy-runtime-proof' }, {
            OTEL_EXPORTER_OTLP_ENDPOINT: process.argv[2],
          }));
          sdk.start();
          const { trace } = require('@opentelemetry/api');
          const http = require('node:http');
          const fastify = require('fastify')();
          fastify.post('/actions/:actionToken', async () => ({ ok: true }));
          await fastify.listen({ host: '127.0.0.1', port: 0 });
          try {
            const address = fastify.server.address();
            const url = new URL('http://127.0.0.1:' + address.port + '/actions/action-payload-private?code=oauth-code-private&state=oauth-state-private&arbitrary=query-private');
            url.username = 'provider-username-private'; url.password = 'provider-password-private';
            await new Promise((resolve, reject) => {
              const request = http.request(url, { method: 'POST', headers: {
                cookie: 'session=cookie-private', authorization: 'Bearer authorization-private',
                'content-type': 'application/json',
              } }, response => { response.resume(); response.on('end', resolve); });
              request.on('error', reject);
              request.end(JSON.stringify({ value: 'body-private' }));
            });
            // The shared exporter also handles provider/custom spans. These
            // attributes are deliberately adversarial; actual driver queries
            // belong to the separately owned provider component lane.
            const span = trace.getTracer('provider-boundary-proof').startSpan('db-operation', { attributes: {
              'db.system.name': 'postgresql', 'db.operation.name': 'SELECT',
              'db.query.text': 'SELECT provider-query-private',
              'db.statement': 'SET redis-command-private',
              'db.query.parameters': 'provider-parameters-private',
              'providerCredentials': 'provider-credentials-private',
              'request.id': 'owned-request-id',
            } });
            span.recordException(new Error('exception-private'));
            span.setStatus({ code: 2, message: 'status-private' });
            span.addEvent('action-event-private', { payload: 'event-payload-private' });
            span.end();
          } finally {
            await fastify.close();
            await sdk.shutdown();
          }
        })().catch(error => { console.error(error); process.exitCode = 1; });
      `;
      await execFileAsync(process.execPath, ['--eval', runtimeProof, factory, endpoint], {
        env: { NODE_ENV: 'test', OTEL_RESOURCE_ATTRIBUTES: 'credential=resource-private' },
        timeout: 20_000,
      });
      const exported = payloads.flatMap(
        (payload) => (JSON.parse(payload) as { resourceSpans?: ExportedResource[] }).resourceSpans ?? [],
      );
      const spans = exported.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans));
      expect(spans.length).toBeGreaterThanOrEqual(3);
      const automatic = exported
        .flatMap((resource) => resource.scopeSpans)
        .filter((scope) => ['@opentelemetry/instrumentation-http', '@fastify/otel'].includes(scope.scope.name));
      expect(automatic.some((scope) => scope.scope.name === '@opentelemetry/instrumentation-http')).toBe(true);
      expect(automatic.some((scope) => scope.scope.name === '@fastify/otel')).toBe(true);
      const body = payloads.join('\n');
      for (const value of [
        'action-payload-private',
        'oauth-code-private',
        'oauth-state-private',
        'query-private',
        'provider-username-private',
        'provider-password-private',
        'cookie-private',
        'authorization-private',
        'body-private',
        'provider-query-private',
        'redis-command-private',
        'provider-parameters-private',
        'provider-credentials-private',
        'exception-private',
        'status-private',
        'action-event-private',
        'event-payload-private',
        'resource-private',
      ]) {
        expect(body).not.toContain(value);
      }
      expect(body).toContain('/actions/:actionToken');
      expect(body).toContain('owned-request-id');
      expect(body).toContain('postgresql');
    } finally {
      await new Promise<void>((resolve, reject) =>
        receiver.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }),
      );
    }
  }, 30_000);

  it('exports a completed span through OTLP/HTTP before shutdown', async () => {
    const requests: ReceivedRequest[] = [];
    const receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requests.push({
          body: Buffer.concat(chunks),
          headers: request.headers,
          method: request.method,
          url: request.url,
        });
        response.writeHead(200, { connection: 'close' });
        response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      receiver.once('error', reject);
      receiver.listen(0, '127.0.0.1', () => {
        receiver.off('error', reject);
        resolve();
      });
    });

    try {
      const address = receiver.address();
      expect(address).not.toBeNull();
      expect(typeof address).not.toBe('string');
      if (!address || typeof address === 'string') {
        throw new Error('OTLP receiver did not bind to a TCP port');
      }

      const endpoint = `http://127.0.0.1:${address.port}`;
      const runtimeProof = `
        const { trace } = await import('@opentelemetry/api');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { resourceFromAttributes } = await import('@opentelemetry/resources');
        const { NodeSDK } = await import('@opentelemetry/sdk-node');
        const sdk = new NodeSDK({
          instrumentations: [],
          resource: resourceFromAttributes({ 'service.name': 'otel-runtime-proof' }),
          traceExporter: new OTLPTraceExporter({ url: new URL('/v1/traces', process.argv[1]).href }),
        });
        sdk.start();
        try {
          const tracer = trace.getTracer('otel-runtime-proof');
          const span = tracer.startSpan('runtime-export-proof', {
            attributes: { proof: 'local-otlp-http' },
          });
          span.end();
        } finally {
          await sdk.shutdown();
        }
        process.exit(0);
      `;

      await execFileAsync(process.execPath, ['--input-type=module', '--eval', runtimeProof, endpoint], {
        env: { NODE_ENV: 'test' },
        timeout: 10_000,
      });

      const traceRequests = requests.filter((request) => request.url === '/v1/traces');
      expect(traceRequests).toHaveLength(1);
      expect(traceRequests[0]).toMatchObject({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
      });
      expect(traceRequests[0]?.body.byteLength).toBeGreaterThan(0);
      expect(traceRequests[0]?.body.toString('utf8')).toContain('otel-runtime-proof');
      expect(traceRequests[0]?.body.toString('utf8')).toContain('runtime-export-proof');
      expect(traceRequests[0]?.body.toString('utf8')).toContain('local-otlp-http');
    } finally {
      await new Promise<void>((resolve, reject) => {
        receiver.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }, 15_000);
});
