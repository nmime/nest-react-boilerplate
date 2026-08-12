// @requirements REQ-FRONTEND-ERROR-005
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiRuntimeEvents, type AuthRequiredPolicy } from '@app/frontend-api-support';
import { AuthRedirectBridge } from './auth-redirect-bridge';

const emitAuthRequired = (redirectTo?: string): void => {
  apiRuntimeEvents.emit({ type: 'auth-required', reason: 'unauthenticated', ...(redirectTo ? { redirectTo } : {}) });
};

const goTo = (path: string): void => {
  globalThis.history.replaceState(null, '', path);
};

describe('AuthRedirectBridge', () => {
  beforeEach(() => {
    apiRuntimeEvents.reset();
    goTo('/');
  });

  afterEach(() => {
    apiRuntimeEvents.reset();
  });

  it('redirects to the sign-in route with a return url', () => {
    goTo('/profile?tab=security');
    render(<AuthRedirectBridge />);

    emitAuthRequired();

    expect(globalThis.location.pathname).toBe('/auth');
    expect(new URLSearchParams(globalThis.location.search).get('returnUrl')).toBe('/profile?tab=security');
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
  });

  it('clears the pending state without navigating when already on the sign-in route', () => {
    goTo('/auth');
    render(<AuthRedirectBridge />);

    emitAuthRequired();

    expect(globalThis.location.pathname).toBe('/auth');
    expect(globalThis.location.search).toBe('');
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
  });

  it('leaves a Telegram mini-app surface to resolve its own sign-in', () => {
    goTo('/tma');
    render(<AuthRedirectBridge />);

    emitAuthRequired();

    expect(globalThis.location.pathname).toBe('/tma');
    expect(apiRuntimeEvents.getState().authRequired).toBe(true);
  });

  // The seam this test exists for: a product surface that legitimately 401s — a catalog that shows
  // more when signed in — must be declarable by the app, not by patching this shared provider.
  it('honours a product policy that tolerates a 401 on its own surface', () => {
    const policy: AuthRequiredPolicy = {
      tolerate: ({ pathname }) => pathname.startsWith('/catalog'),
    };
    goTo('/catalog/tools');
    render(<AuthRedirectBridge policy={policy} />);

    emitAuthRequired();

    expect(globalThis.location.pathname).toBe('/catalog/tools');
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
  });

  it('keeps the default rules when a product policy only adds a rule', () => {
    const policy: AuthRequiredPolicy = { tolerate: ({ pathname }) => pathname.startsWith('/catalog') };
    goTo('/profile');
    render(<AuthRedirectBridge policy={policy} />);

    emitAuthRequired();

    expect(globalThis.location.pathname).toBe('/auth');
  });
});
