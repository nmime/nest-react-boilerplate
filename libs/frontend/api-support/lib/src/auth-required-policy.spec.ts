// @requirements REQ-FRONTEND-ERROR-005
import { describe, expect, it } from 'vitest';

import { resolveAuthRequiredAction, type AuthRequiredPolicyContext } from './auth-required-policy';

const context = (overrides: Partial<AuthRequiredPolicyContext> = {}): AuthRequiredPolicyContext => ({
  event: { type: 'auth-required', reason: 'unauthenticated' },
  pathname: '/dashboard',
  ...overrides,
});

describe('resolveAuthRequiredAction', () => {
  it('redirects by default', () => {
    expect(resolveAuthRequiredAction(context())).toBe('redirect');
    expect(resolveAuthRequiredAction(context(), {})).toBe('redirect');
  });

  it('clears instead of redirecting when the user is already on the sign-in route', () => {
    expect(
      resolveAuthRequiredAction(context({ pathname: '/auth' }), {
        isAuthRoute: ({ pathname }) => pathname === '/auth',
      }),
    ).toBe('clear');
    expect(resolveAuthRequiredAction(context(), { isAuthRoute: ({ pathname }) => pathname === '/auth' })).toBe(
      'redirect',
    );
  });

  it('clears a 401 a public-but-session-aware surface declares expected', () => {
    const tolerate = ({ event, pathname }: AuthRequiredPolicyContext) =>
      pathname.startsWith('/marketplace') && event.error?.endpoint === '/marketplace/catalog';

    expect(
      resolveAuthRequiredAction(
        context({
          pathname: '/marketplace/catalog',
          event: {
            type: 'auth-required',
            reason: 'unauthenticated',
            error: {
              code: 'unauthorized',
              endpoint: '/marketplace/catalog',
              id: 'req-1',
              kind: 'auth',
              message: 'Unauthorized',
              status: 401,
            },
          },
        }),
        { tolerate },
      ),
    ).toBe('clear');
    expect(resolveAuthRequiredAction(context({ pathname: '/marketplace/catalog' }), { tolerate })).toBe('redirect');
  });

  it('ignores the event on surfaces that own their sign-in flow', () => {
    const suppressRedirect = ({ pathname }: AuthRequiredPolicyContext) => pathname.startsWith('/tma');

    expect(resolveAuthRequiredAction(context({ pathname: '/tma' }), { suppressRedirect })).toBe('ignore');
    expect(resolveAuthRequiredAction(context(), { suppressRedirect })).toBe('redirect');
  });

  it('resolves the sign-in route before a tolerated surface and tolerance before suppression', () => {
    const policy = {
      isAuthRoute: () => true,
      suppressRedirect: () => true,
      tolerate: () => true,
    };

    expect(resolveAuthRequiredAction(context(), policy)).toBe('clear');
    expect(resolveAuthRequiredAction(context(), { ...policy, isAuthRoute: () => false })).toBe('clear');
    expect(resolveAuthRequiredAction(context(), { ...policy, isAuthRoute: () => false, tolerate: () => false })).toBe(
      'ignore',
    );
  });
});
