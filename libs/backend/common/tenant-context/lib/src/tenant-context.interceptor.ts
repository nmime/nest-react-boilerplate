import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { setAmbientTenantId } from './tenant-scope';
import { TenantScopeExemptMetadataKey } from './tenant-scope-exempt.decorator';

/**
 * Structural shape of a request carrying a resolved tenant id.
 *
 * Deliberately not imported from the auth feature: this lib is `type:common` and
 * the Nx boundary forbids depending on a feature tier. The auth session guard
 * runs before interceptors and sets these fields.
 */
export interface TenantScopedRequestLike {
  tenantId?: string;
  user?: { tenantId?: string };
  auth?: { tenantId?: string };
}

/** DI token for the metadata keys that mark a route as legitimately tenant-less. */
export const TenantScopeExemptMetadataKeysInjectToken = Symbol('TenantScopeExemptMetadataKeysInjectToken');

/**
 * Keys treated as exempt when the token is not provided.
 *
 * These are the literal values of `@Health()` (`@app/backend-common-health`) and
 * `@Public()` (`@app/backend-feature-auth-shared`). They are restated rather than
 * imported: the auth one is feature-tier and importing it would invert the
 * dependency, and defaulting to safe-by-default beats an app silently forgetting
 * to wire its probe routes. `tenant-context.interceptor.spec.ts` pins the values.
 */
export const DefaultTenantScopeExemptMetadataKeys = ['app:health-route', 'auth:public'] as const;

/**
 * Publishes the caller's tenant id as the ambient tenant, and REFUSES a
 * tenant-scoped HTTP request that has none.
 *
 * Fail-closed on purpose. The tempting shape is `if (tenantId) { publish }` with
 * no else — but that lets a request with no resolved tenant fall through
 * silently, which is exactly the case worth catching: under fail-closed
 * row-level security every policy then matches zero rows, so the caller sees an
 * empty result set instead of an error, and a missing `where tenantId` looks
 * like "no data" rather than a bug.
 *
 * A route that legitimately has no tenant must say so — `@Health()`,
 * `@Public()`, or `@TenantScopeExempt('<reason>')` — and, if it touches
 * tenant-scoped data, establish its own scope with `withAmbientTenant`.
 *
 * Non-HTTP execution contexts are out of scope by construction: they never carry
 * an HTTP request, and their entry points own their scope explicitly.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly exemptMetadataKeys: readonly string[];

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(TenantScopeExemptMetadataKeysInjectToken)
    exemptMetadataKeys?: readonly string[],
  ) {
    this.exemptMetadataKeys = [
      TenantScopeExemptMetadataKey,
      ...(exemptMetadataKeys ?? DefaultTenantScopeExemptMetadataKeys),
    ];
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<TenantScopedRequestLike>();
    const tenantId = request.tenantId ?? request.user?.tenantId ?? request.auth?.tenantId;

    if (!tenantId) {
      if (this.isExempt(context)) {
        return next.handle();
      }

      throw new InternalServerErrorException(
        'No tenant is resolved for this request. Declare the route @Public(), @Health(), or @TenantScopeExempt("<reason>") if it legitimately has none.',
      );
    }

    const failure = setAmbientTenantId(tenantId);
    if (failure) {
      throw new InternalServerErrorException(failure.message);
    }

    return next.handle();
  }

  private isExempt(context: ExecutionContext): boolean {
    return this.exemptMetadataKeys.some(
      (key) => this.reflector.getAllAndOverride<unknown>(key, [context.getHandler(), context.getClass()]) !== undefined,
    );
  }
}
