import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor, TenantScopeExemptMetadataKeysInjectToken } from './tenant-context.interceptor';

export interface TenantContextModuleOptions {
  /**
   * Route metadata keys that mark a request as legitimately tenant-less.
   *
   * Omit to use the safe defaults (`@Health()` and `@Public()`), which is what
   * almost every app wants. Supply the list only when an app defines its own
   * exemption decorator, and note that supplying it REPLACES the defaults —
   * restate them, or health probes start failing closed.
   */
  exemptMetadataKeys?: readonly string[];
}

/**
 * Installs the fail-closed tenant scope for a backend application.
 *
 * This module exists because a global interceptor has to be registered by
 * someone, and for one release nobody was: `TenantContextInterceptor` shipped,
 * was tested, was documented as refusing tenant-less requests, and ran on zero
 * of them because no `APP_INTERCEPTOR` provider named it. The capability wiring
 * can only reference a Nest module, so the binding lives here.
 *
 * Global on purpose: tenant scope that applies to some feature modules and not
 * others is worse than none, because the gap is invisible at the call site.
 */
@Module({})
export class TenantContextModule {
  static forRoot(options: TenantContextModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [{ provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor }];

    if (options.exemptMetadataKeys) {
      providers.push({ provide: TenantScopeExemptMetadataKeysInjectToken, useValue: options.exemptMetadataKeys });
    }

    return { module: TenantContextModule, global: true, providers };
  }
}
