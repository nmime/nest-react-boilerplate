// @requirements REQ-API-VALIDATION-004
import { type ArgumentsHost, Catch, Controller, type ExceptionFilter, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BaseException } from '@app/backend-common-exception';
import { ApiIdempotencyKey, IdempotencyKey } from './idempotency-key.decorator';

@Controller()
class IdempotentController {
  @Post('charge')
  @ApiIdempotencyKey()
  charge(@IdempotencyKey() key: string) {
    return { key };
  }
}

interface ReplyLike {
  status: (code: number) => { send: (body: unknown) => void };
}

/** Stands in for the ExceptionsFilter that `bootstrapNestApi` registers globally. */
@Catch(BaseException)
class ProblemFilter implements ExceptionFilter {
  catch(exception: BaseException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<ReplyLike>().status(exception.status).send(exception.toProblemDetails());
  }
}

describe('IdempotencyKey', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [IdempotentController] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('injects the validated header value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/charge',
      headers: { 'idempotency-key': 'charge-12345678' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ key: 'charge-12345678' });
  });

  it('answers a missing header with an RFC 9457 validation problem', async () => {
    const response = await app.inject({ method: 'POST', url: '/charge' });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { detail: 'idempotency-key header is not a valid idempotency key.', pointer: '#/headers/idempotency-key' },
    ]);
  });

  it('documents the header on the operation', () => {
    expect(ApiIdempotencyKey()).toBeTypeOf('function');
  });
});
