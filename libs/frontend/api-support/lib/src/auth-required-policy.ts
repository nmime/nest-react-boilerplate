import type { ApiRuntimeEvent } from './runtime-events';

export type ApiAuthRequiredEvent = Extract<ApiRuntimeEvent, { type: 'auth-required' }>;

/** What a redirect bridge should do with one `auth-required` event. */
export type AuthRequiredAction = 'redirect' | 'clear' | 'ignore';

export interface AuthRequiredPolicyContext {
  readonly event: ApiAuthRequiredEvent;
  readonly pathname: string;
}

/**
 * The seam a redirect bridge exposes to the app that owns the routes. Without it, every surface
 * that legitimately produces a 401 — a public catalog that shows more when signed in, a mini app
 * with its own sign-in flow — ends up as a route literal inside shared provider code.
 */
export interface AuthRequiredPolicy {
  /** The user is already on the sign-in route, so there is nowhere to send them. */
  readonly isAuthRoute?: (context: AuthRequiredPolicyContext) => boolean;
  /** This 401 is expected on this surface; drop the pending auth state and stay put. */
  readonly tolerate?: (context: AuthRequiredPolicyContext) => boolean;
  /** This surface drives its own sign-in; leave the pending auth state for it to resolve. */
  readonly suppressRedirect?: (context: AuthRequiredPolicyContext) => boolean;
}

export const resolveAuthRequiredAction = (
  context: AuthRequiredPolicyContext,
  { isAuthRoute, suppressRedirect, tolerate }: AuthRequiredPolicy = {},
): AuthRequiredAction => {
  if (isAuthRoute?.(context) === true || tolerate?.(context) === true) {
    return 'clear';
  }

  return suppressRedirect?.(context) === true ? 'ignore' : 'redirect';
};
