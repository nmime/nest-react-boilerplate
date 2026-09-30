import type { Attributes } from '@opentelemetry/api';
import type { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';

type ExportSpan = Parameters<OTLPTraceExporter['export']>[0][number];
type Exporter = Pick<OTLPTraceExporter, 'export' | 'shutdown' | 'forceFlush'>;

// This is deliberately an allowlist: arbitrary query keys and business payload
// names cannot be exhaustively recognized by a credential-name denylist.
const allowedAttributes = new Set([
  'http.request.method',
  'http.method',
  'http.response.status_code',
  'http.status_code',
  'http.route',
  'network.protocol.name',
  'network.protocol.version',
  'network.transport',
  'server.address',
  'server.port',
  'db.system.name',
  'db.system',
  'db.operation.name',
  'db.operation',
  'rpc.system',
  'rpc.service',
  'rpc.method',
  'request.id',
  'requestId',
  'request_id',
  'exception.type',
]);
const resourceAttributes = new Set(['service.name', 'service.version', 'deployment.environment.name']);

function selectAttributes(attributes: Attributes, allowed = allowedAttributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key, value]) =>
        allowed.has(key) &&
        (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 512)),
    ),
  );
}

export function privateExportSpan(span: ExportSpan): ExportSpan {
  const attributes = selectAttributes(span.attributes);
  const method = attributes['http.request.method'] ?? attributes['http.method'];
  const route = attributes['http.route'];
  let name = span.name;
  if (typeof method === 'string') {
    name = typeof route === 'string' ? `${method} ${route}` : method;
  }
  return {
    name,
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status: { code: span.status.code },
    attributes,
    links: span.links.map((link) => ({ ...link, attributes: selectAttributes(link.attributes ?? {}) })),
    events: span.events
      .filter((event) => event.name === 'exception')
      .map((event) => ({
        ...event,
        attributes: selectAttributes(event.attributes ?? {}),
      })),
    duration: span.duration,
    ended: span.ended,
    resource: resourceFromAttributes(selectAttributes(span.resource.attributes, resourceAttributes)),
    instrumentationScope: { name: span.instrumentationScope.name, version: span.instrumentationScope.version },
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

/** Copy exported spans without mutating the SDK or other processors' spans. */
export class PrivacyTraceExporter implements Exporter {
  constructor(private readonly exporter: Exporter) {}

  export(...[spans, callback]: Parameters<OTLPTraceExporter['export']>): void {
    this.exporter.export(spans.map(privateExportSpan), callback);
  }

  shutdown(): Promise<void> {
    return this.exporter.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.exporter.forceFlush();
  }
}
