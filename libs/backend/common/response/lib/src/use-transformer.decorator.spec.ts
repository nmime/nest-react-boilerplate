import { BadRequestException, Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UseTransformer } from './use-transformer.decorator';

@UseTransformer()
@Controller()
class TransformedController {
  @Get('ok')
  success() {
    return ok({ value: 1 });
  }

  @Get('boom')
  failure() {
    throw new BadRequestException('Invalid input');
  }
}

describe('UseTransformer', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TransformedController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps successful results through the response interceptor', async () => {
    const response = await app.inject({ method: 'GET', url: '/ok' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { value: 1 } });
  });

  it('converts thrown exceptions into problem+json through the filter', async () => {
    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      status: 400,
      title: 'Bad Request',
    });
  });
});
