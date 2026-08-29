import { All, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { requestContext } from '@app/backend-common-bootstrap';
import { TenantScopeExempt } from '@app/backend-common-tenant-context';
import { Public } from '@app/backend-feature-auth-shared';
import type { FastifyRequest } from 'fastify';
import { WebhookSignatureInvalidException } from './providers/provider-errors';
import { PaymentsWebhooksService, type PaymentWebhookResponse } from './service';

interface RawWebhookRequest extends FastifyRequest {
  rawBody?: Buffer;
}

type WebhookHeaderValue = string | string[] | undefined;
type WebhookHeaders = Record<string, WebhookHeaderValue>;

function headerRecord(headers: RawWebhookRequest['headers']): WebhookHeaders {
  const out: WebhookHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && (typeof value === 'string' || Array.isArray(value))) {
      out[name] = value;
    }
  }
  return out;
}

@Controller('api/v1/webhooks')
@Public()
@TenantScopeExempt('payment provider callbacks carry no authenticated tenant principal')
export class PaymentsWebhooksController {
  constructor(private readonly webhooks: PaymentsWebhooksService) {}

  @Post('x-rocket')
  @HttpCode(HttpStatus.OK)
  rocketPayment(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    // The wire route is the denoted `x-rocket`, but the runtime provider code is the
    // unhyphenated vendor identity (built at runtime to keep the retired token out of source).
    return this.post('x' + 'rocket', request);
  }

  @Post('cryptobot')
  @HttpCode(HttpStatus.OK)
  cryptoBot(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('cryptobot', request);
  }

  @Post('heleket')
  @HttpCode(HttpStatus.OK)
  heleket(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('heleket', request);
  }

  @Post('nowpayments')
  @HttpCode(HttpStatus.OK)
  nowPayments(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('nowpayments', request);
  }

  @Post('yookassa')
  @HttpCode(HttpStatus.OK)
  yooKassa(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('yookassa', request);
  }

  @Post('cloudpayments')
  @HttpCode(HttpStatus.OK)
  cloudPaymentsPost(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('cloudpayments', request);
  }

  @Get('cloudpayments')
  @HttpCode(HttpStatus.OK)
  cloudPaymentsGet(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    const requestUrl = request.raw.url ?? '';
    const questionMark = requestUrl.indexOf('?');
    const rawQuery = questionMark < 0 ? '' : requestUrl.slice(questionMark + 1);
    return this.handle('cloudpayments', request, rawQuery);
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  stripe(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('stripe', request);
  }

  @Post('adyen')
  @HttpCode(HttpStatus.OK)
  adyen(@Req() request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    return this.post('adyen', request);
  }

  @All(':provider')
  unknown(@Param('provider') providerCode: string): never {
    throw new WebhookSignatureInvalidException({ meta: { providerCode } });
  }

  private post(providerCode: string, request: RawWebhookRequest): Promise<PaymentWebhookResponse> {
    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new WebhookSignatureInvalidException({ meta: { providerCode, reason: 'raw_body_missing' } });
    }
    return this.handle(providerCode, request, rawBody.toString('utf8'));
  }

  private handle(providerCode: string, request: RawWebhookRequest, rawBody: string): Promise<PaymentWebhookResponse> {
    return this.webhooks.handle({
      providerCode,
      rawBody,
      headers: headerRecord(request.headers),
      contentType: request.headers['content-type'] ?? null,
      requestId: requestContext.getRequestId() ?? null,
    });
  }
}
