// @requirements REQ-PAYMENT-WEBHOOK-003
import type { Counter, Histogram, Meter } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import { PaymentWebhookMetricsService } from './webhook-metrics.service';

describe('PaymentWebhookMetricsService', () => {
  it('creates production OpenTelemetry instruments and records bounded provider/outcome attributes', () => {
    const receivedAdd = vi.fn();
    const rejectedAdd = vi.fn();
    const processedAdd = vi.fn();
    const record = vi.fn();
    const counterNames: string[] = [];
    const meter = {
      createCounter: vi.fn((name: string) => {
        counterNames.push(name);
        if (name === 'webhooks.received') {
          return { add: receivedAdd } as unknown as Counter;
        }
        if (name === 'webhooks.rejected') {
          return { add: rejectedAdd } as unknown as Counter;
        }
        return { add: processedAdd } as unknown as Counter;
      }),
      createHistogram: vi.fn(() => ({ record }) as unknown as Histogram),
    } as unknown as Meter;

    const metrics = new PaymentWebhookMetricsService(meter);
    metrics.received({ providerCode: 'stripe', signature: 'valid' });
    metrics.rejected({ providerCode: 'stripe', signature: 'invalid', rejectionReason: 'bad_signature' });
    metrics.completed({ providerCode: 'stripe', outcome: 'applied', durationSeconds: 0.25 });
    metrics.received({ providerCode: 'yookassa' });
    metrics.rejected({ providerCode: 'stripe' });
    metrics.rejected({ providerCode: 'stripe', outcome: 'error' });
    metrics.completed({ providerCode: 'stripe' });

    expect(counterNames).toEqual(['webhooks.received', 'webhooks.rejected', 'webhooks.processed']);
    expect(meter.createHistogram).toHaveBeenCalledWith(
      'webhooks.processing_seconds',
      expect.objectContaining({ unit: 's' }),
    );
    expect(receivedAdd).toHaveBeenCalledWith(1, { provider: 'stripe', signature: 'valid' });
    expect(rejectedAdd).toHaveBeenCalledWith(1, {
      provider: 'stripe',
      reason: 'bad_signature',
      signature: 'invalid',
    });
    expect(processedAdd).toHaveBeenCalledWith(1, { provider: 'stripe', outcome: 'applied' });
    expect(record).toHaveBeenCalledWith(0.25, { provider: 'stripe', outcome: 'applied' });
    expect(receivedAdd).toHaveBeenCalledWith(1, { provider: 'yookassa', signature: 'none' });
    expect(rejectedAdd).toHaveBeenCalledWith(1, { provider: 'stripe', reason: 'parse' });
    expect(rejectedAdd).toHaveBeenCalledWith(1, { provider: 'stripe', reason: 'parse', outcome: 'error' });
    expect(processedAdd).toHaveBeenCalledWith(1, { provider: 'stripe', outcome: 'applied' });
    expect(record).toHaveBeenCalledWith(0, { provider: 'stripe', outcome: 'applied' });
  });
});
