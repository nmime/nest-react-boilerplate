// @requirements REQ-AUTH-TENANT-ISOLATION-010
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { requestContext } from '@app/backend-common-request-context';
import {
  DefaultTenantScopeExemptMetadataKeys,
  TenantContextInterceptor,
  type TenantScopedRequestLike,
} from './tenant-context.interceptor';
import { getAmbientTenantId } from './tenant-scope';
import { TenantScopeExempt, TenantScopeExemptMetadataKey } from './tenant-scope-exempt.decorator';

const tenantId = '11111111-1111-4111-8111-111111111111';

const handler = (): CallHandler => ({ handle: () => of('handled') });

/** Minimal ExecutionContext double; `metadata` stands in for route decorators. */
const httpContext = (
  request: TenantScopedRequestLike,
  metadata: Record<string, unknown> = {},
  type = 'http',
): { context: ExecutionContext; reflector: Reflector } => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => metadata[key as string] as never);

  return {
    reflector,
    context: {
      getType: () => type,
      getHandler: () => () => undefined,
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
};

describe('TenantScopeExempt', () => {
  it('records the reason so an exemption is self-documenting and assertable', () => {
    class BotWebhookController {
      @TenantScopeExempt('telegram webhook carries no principal')
      handle(): void {
        // Route body is irrelevant; the metadata is the contract.
      }
    }

    const reason = new Reflector().get<string>(TenantScopeExemptMetadataKey, BotWebhookController.prototype.handle);

    expect(reason).toBe('telegram webhook carries no principal');
  });
});

describe('DefaultTenantScopeExemptMetadataKeys', () => {
  it('pins the literal keys it restates from other libs', () => {
    // `@Health()` is common-tier and `@Public()` is feature-tier; importing the
    // latter would invert the Nx dependency direction. These literals must stay
    // in step with those decorators.
    expect(DefaultTenantScopeExemptMetadataKeys).toEqual(['app:health-route', 'auth:public']);
  });
});

describe('TenantContextInterceptor', () => {
  it('passes non-http contexts through untouched', async () => {
    const { context, reflector } = httpContext({}, {}, 'rpc');
    const interceptor = new TenantContextInterceptor(reflector);

    await expect(firstValueFrom(interceptor.intercept(context, handler()))).resolves.toBe('handled');
  });

  it.each([
    ['request.tenantId', { tenantId }],
    ['request.user.tenantId', { user: { tenantId } }],
    ['request.auth.tenantId', { auth: { tenantId } }],
  ])('publishes the tenant resolved from %s', async (_label, request) => {
    const { context, reflector } = httpContext(request);
    const interceptor = new TenantContextInterceptor(reflector);

    await requestContext.run(async () => {
      await firstValueFrom(interceptor.intercept(context, handler()));
      expect(getAmbientTenantId()).toBe(tenantId);
    });
  });

  it('prefers the request tenant over the principal copies', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const { context, reflector } = httpContext({ tenantId, user: { tenantId: other } });
    const interceptor = new TenantContextInterceptor(reflector);

    await requestContext.run(async () => {
      await firstValueFrom(interceptor.intercept(context, handler()));
      expect(getAmbientTenantId()).toBe(tenantId);
    });
  });

  it('refuses a tenant-scoped request that resolved no tenant', () => {
    // Fail closed. The alternative — falling through silently — means every
    // policy matches zero rows and a missing tenant looks like "no data".
    const { context, reflector } = httpContext({});
    const interceptor = new TenantContextInterceptor(reflector);

    expect(() => interceptor.intercept(context, handler())).toThrow(/No tenant is resolved/u);
  });

  it.each([
    ['@TenantScopeExempt', { [TenantScopeExemptMetadataKey]: 'telegram webhook has no principal' }],
    ['@Health', { 'app:health-route': true }],
    ['@Public', { 'auth:public': true }],
  ])('allows a tenant-less request declared %s', async (_label, metadata) => {
    const { context, reflector } = httpContext({}, metadata);
    const interceptor = new TenantContextInterceptor(reflector);

    await expect(firstValueFrom(interceptor.intercept(context, handler()))).resolves.toBe('handled');
  });

  it('honours injected exempt keys instead of the defaults', () => {
    const { context, reflector } = httpContext({}, { 'auth:public': true });
    const interceptor = new TenantContextInterceptor(reflector, ['custom:exempt']);

    // The default `auth:public` no longer applies once keys are injected.
    expect(() => interceptor.intercept(context, handler())).toThrow(/No tenant is resolved/u);
  });

  it('still honours its own exemption decorator when keys are injected', async () => {
    const { context, reflector } = httpContext({}, { [TenantScopeExemptMetadataKey]: 'probe' });
    const interceptor = new TenantContextInterceptor(reflector, ['custom:exempt']);

    await expect(firstValueFrom(interceptor.intercept(context, handler()))).resolves.toBe('handled');
  });

  it('rejects a malformed tenant id rather than scoping to garbage', () => {
    const { context, reflector } = httpContext({ tenantId: 'tenant-one' });
    const interceptor = new TenantContextInterceptor(reflector);

    requestContext.run(() => {
      expect(() => interceptor.intercept(context, handler())).toThrow(/not a UUID/u);
    });
  });

  it('rejects the request when no CLS store is active', () => {
    // Guards run before interceptors, but the CLS interceptor must run before
    // this one. If it did not, publishing would no-op and scoping would vanish.
    const { context, reflector } = httpContext({ tenantId });
    const interceptor = new TenantContextInterceptor(reflector);

    expect(() => interceptor.intercept(context, handler())).toThrow(/No request context is active/u);
  });
});
