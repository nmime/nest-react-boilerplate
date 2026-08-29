// @requirements REQ-PAYMENT-WEBHOOK-001 REQ-PAYMENT-WEBHOOK-002
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicAuthMetadataKey } from '@app/backend-feature-auth-shared';
import { UseTransformer } from '@app/backend-common-response';
import { TenantScopeExemptMetadataKey } from '@app/backend-common-tenant-context';
import { PaymentsWebhooksController } from './payments-webhooks.controller';
import {
  WebhookProcessingException,
  WebhookReplayedException,
  WebhookSignatureInvalidException,
  WebhookStaleException,
} from './providers/provider-errors';
import { PaymentsWebhooksService } from './service';

const handled = vi.fn(async () => ({ accepted: true as const, replayed: false, processing: 'applied' as const }));

@UseTransformer()
class HttpPaymentsWebhooksController extends PaymentsWebhooksController {}

describe('PaymentsWebhooksController HTTP ingress', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HttpPaymentsWebhooksController],
      providers: [{ provide: PaymentsWebhooksService, useValue: { handle: handled } }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { rawBody: true });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('marks the whole controller public and explicitly tenant-less', () => {
    expect(Reflect.getMetadata(PublicAuthMetadataKey, PaymentsWebhooksController)).toBe(true);
    expect(Reflect.getMetadata(TenantScopeExemptMetadataKey, PaymentsWebhooksController)).toContain(
      'provider callbacks',
    );
  });

  it.each([
    // The x-rocket wire route is denoted, while the runtime provider code is the unhyphenated
    // vendor identity; every other provider's route and code coincide.
    ['x-rocket', 'x' + 'rocket'],
    ['cryptobot', 'cryptobot'],
    ['heleket', 'heleket'],
    ['nowpayments', 'nowpayments'],
    ['yookassa', 'yookassa'],
    ['cloudpayments', 'cloudpayments'],
    ['stripe', 'stripe'],
    ['adyen', 'adyen'],
  ] as const)('mounts POST /api/v1/webhooks/%s and preserves exact JSON bytes', async (route, expectedProviderCode) => {
    handled.mockClear();
    const rawBody = '{ "id": "evt_1", "nested": {"amount": 1000}, "slash": "a\\/b" }';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/webhooks/${route}`,
      headers: { 'content-type': 'application/json', 'x-signature': 'sig' },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, replayed: false, processing: 'applied' });
    expect(handled).toHaveBeenCalledWith(
      expect.objectContaining({ providerCode: expectedProviderCode, rawBody, contentType: 'application/json' }),
    );
  });

  it('rejects POST delivery when the production raw-body capture is missing', () => {
    const controller = app.get(HttpPaymentsWebhooksController);

    expect(() => controller.stripe({ headers: {}, raw: { url: '/api/v1/webhooks/stripe' } } as never)).toThrow(
      WebhookSignatureInvalidException,
    );
  });

  it('accepts CloudPayments POST form IPN with exact encoded bytes', async () => {
    handled.mockClear();
    const rawBody = 'TransactionId=123&Amount=10.00&Data=%7B%22space%22%3A%22a+b%22%7D';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/cloudpayments',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-content-hmac': 'sig' },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(handled).toHaveBeenCalledWith(expect.objectContaining({ providerCode: 'cloudpayments', rawBody }));
  });

  it('accepts CloudPayments GET IPN and preserves the raw parameter string', async () => {
    handled.mockClear();
    const rawQuery = 'TransactionId=123&Amount=10.00&Data=%7B%22space%22%3A%22a+b%22%7D';
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/webhooks/cloudpayments?${rawQuery}`,
      headers: { 'x-content-hmac': 'sig' },
    });

    expect(response.statusCode).toBe(200);
    expect(handled).toHaveBeenCalledWith(expect.objectContaining({ providerCode: 'cloudpayments', rawBody: rawQuery }));
  });

  it('normalizes absent CloudPayments query strings and forwards only usable headers', async () => {
    handled.mockClear();
    const controller = app.get(HttpPaymentsWebhooksController);

    await controller.cloudPaymentsGet({
      headers: { useful: ['one', 'two'], missing: undefined, invalid: 7 },
      raw: { url: '/api/v1/webhooks/cloudpayments' },
    } as never);
    await controller.cloudPaymentsGet({ headers: {}, raw: {} } as never);

    expect(handled).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rawBody: '', headers: { useful: ['one', 'two'] } }),
    );
    expect(handled).toHaveBeenNthCalledWith(2, expect.objectContaining({ rawBody: '', headers: {} }));
  });

  it.each([
    [new WebhookSignatureInvalidException(), 400, 'webhook-signature-invalid', 'Webhook Signature Invalid'],
    [new WebhookReplayedException(), 409, 'webhook-replayed', 'Webhook Replayed'],
    [new WebhookStaleException(), 410, 'webhook-stale', 'Webhook Stale'],
    [new WebhookProcessingException(), 502, 'webhook-processing-error', 'Webhook Processing Error'],
  ] as const)('serializes service failures as exact RFC 9457 %s responses', async (failure, status, code, title) => {
    handled.mockRejectedValueOnce(failure);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(response.statusCode).toBe(status);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      type: expect.stringContaining(code),
      title,
      status,
      code,
    });
  });

  it('returns finalized replay success bodies unchanged', async () => {
    handled.mockResolvedValueOnce({ accepted: true, replayed: true, processing: 'applied' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, replayed: true, processing: 'applied' });
  });

  it('returns exact RFC 9457 problem responses for unknown providers without dispatch', async () => {
    handled.mockClear();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/unknown',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      type: expect.stringContaining('webhook-signature-invalid'),
      title: 'Webhook Signature Invalid',
      status: 400,
      code: 'webhook-signature-invalid',
    });
    expect(handled).not.toHaveBeenCalled();
  });
});
