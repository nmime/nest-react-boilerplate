// @requirements REQ-RUNTIME-OBSERVABILITY-005
import { execFile } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

interface ReceivedRequest {
  body: Buffer;
  headers: IncomingHttpHeaders;
  method?: string;
  url?: string;
}

const execFileAsync = promisify(execFile);

describe('OpenTelemetry runtime export', () => {
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
