import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';

export type PaymentWebhookSignatureMetric = 'valid' | 'invalid' | 'none';
export type PaymentWebhookRejectionReason =
  'bad_signature' | 'replay' | 'stale' | 'parse' | 'unknown_provider' | 'persistence';
export type PaymentWebhookOutcome = 'applied' | 'ignored' | 'replayed' | 'pending' | 'rejected' | 'error';

export interface PaymentWebhookMetricSnapshot {
  readonly providerCode: string;
  readonly signature?: PaymentWebhookSignatureMetric;
  readonly rejectionReason?: PaymentWebhookRejectionReason;
  readonly outcome?: PaymentWebhookOutcome;
  readonly durationSeconds?: number;
}

/** Records the U6 ingress counters and latency through the process OpenTelemetry meter. */
export class PaymentWebhookMetricsService {
  private readonly receivedCounter: Counter;
  private readonly rejectedCounter: Counter;
  private readonly processedCounter: Counter;
  private readonly processingSeconds: Histogram;

  constructor(meter: Meter = metrics.getMeter('@app/backend-feature-payments-main')) {
    this.receivedCounter = meter.createCounter('webhooks.received', {
      description: 'Webhook deliveries received after provider verification.',
      unit: '{delivery}',
    });
    this.rejectedCounter = meter.createCounter('webhooks.rejected', {
      description: 'Webhook deliveries rejected by ingress.',
      unit: '{delivery}',
    });
    this.processedCounter = meter.createCounter('webhooks.processed', {
      description: 'Webhook deliveries durably completed or replay-acknowledged.',
      unit: '{delivery}',
    });
    this.processingSeconds = meter.createHistogram('webhooks.processing_seconds', {
      description: 'Webhook ingress processing latency.',
      unit: 's',
    });
  }

  received(snapshot: PaymentWebhookMetricSnapshot): void {
    this.receivedCounter.add(1, {
      provider: snapshot.providerCode,
      signature: snapshot.signature ?? 'none',
    });
  }

  rejected(snapshot: PaymentWebhookMetricSnapshot): void {
    this.rejectedCounter.add(1, {
      provider: snapshot.providerCode,
      reason: snapshot.rejectionReason ?? 'parse',
      ...(snapshot.signature === undefined ? {} : { signature: snapshot.signature }),
      ...(snapshot.outcome === undefined ? {} : { outcome: snapshot.outcome }),
    });
  }

  completed(snapshot: PaymentWebhookMetricSnapshot): void {
    const attributes = {
      provider: snapshot.providerCode,
      outcome: snapshot.outcome ?? 'applied',
    };
    this.processedCounter.add(1, attributes);
    this.processingSeconds.record(snapshot.durationSeconds ?? 0, attributes);
  }
}
