// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { APP_INTERCEPTOR } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantContextModule } from './tenant-context.module';
import { TenantScopeExemptMetadataKeysInjectToken } from './tenant-context.interceptor';

describe('TenantContextModule.forRoot', () => {
  it('registers the interceptor globally, which is the whole point of the module', () => {
    // The interceptor existed for a release without this module, so nothing
    // registered it and the documented fail-closed guarantee ran on zero
    // requests. A module whose only job is the APP_INTERCEPTOR binding is what
    // lets the capability wiring reach it, because backendWiring can only name
    // a Nest module.
    const module = TenantContextModule.forRoot();

    expect(module.module).toBe(TenantContextModule);
    expect(module.providers).toContainEqual({ provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor });
  });

  it('passes exempt metadata keys through when an app supplies its own', () => {
    const keys = ['auth:public', 'app:health-route', 'billing:webhook'];

    expect(TenantContextModule.forRoot({ exemptMetadataKeys: keys }).providers).toContainEqual({
      provide: TenantScopeExemptMetadataKeysInjectToken,
      useValue: keys,
    });
  });

  it('provides no key override when none is given, so the safe defaults apply', () => {
    const providers = TenantContextModule.forRoot().providers ?? [];

    expect(
      providers.some(
        (provider) => 'provide' in provider && provider.provide === TenantScopeExemptMetadataKeysInjectToken,
      ),
    ).toBe(false);
  });

  it('is a global module, so every feature module inherits the scope', () => {
    expect(TenantContextModule.forRoot().global).toBe(true);
  });
});
