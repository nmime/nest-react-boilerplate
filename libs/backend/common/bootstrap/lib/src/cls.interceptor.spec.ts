import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClsInterceptor } from './cls.interceptor';

function createContext(request: Record<string, unknown>, response: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

const next: CallHandler<string> = {
  handle: () => of('ok'),
};

describe('ClsInterceptor', () => {
  it('sets the request id through the Fastify reply API', async () => {
    const response = { header: vi.fn() };
    const context = createContext({ headers: { 'x-request-id': 'fastify-request' } }, response);

    await expect(firstValueFrom(new ClsInterceptor().intercept(context, next))).resolves.toBe('ok');

    expect(response.header).toHaveBeenCalledWith('x-request-id', 'fastify-request');
  });

  it('supports Node and raw reply header APIs', async () => {
    const setHeader = vi.fn();
    const nodeContext = createContext({ headers: { 'x-request-id': 'node-request' } }, { setHeader });
    await firstValueFrom(new ClsInterceptor().intercept(nodeContext, next));
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'node-request');

    const rawSetHeader = vi.fn();
    const rawContext = createContext(
      { headers: { 'x-request-id': 'raw-request' } },
      { raw: { setHeader: rawSetHeader } },
    );
    await firstValueFrom(new ClsInterceptor().intercept(rawContext, next));
    expect(rawSetHeader).toHaveBeenCalledWith('x-request-id', 'raw-request');
  });
});
