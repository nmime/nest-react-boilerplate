import {
  clearSessionPrincipal,
  setSessionPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthSessionView,
} from '@app/backend-feature-auth-shared';
import { toSessionPrincipal } from '../../../application';

type SessionMethod = 'destroy' | 'regenerate' | 'save';
export const SessionCookieName = 'SESSION_COOKIE_NAME';

function getSessionCookieName(): string {
  const configured = process.env[SessionCookieName]?.trim();
  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === 'production' ? '__Host-nrb.sid' : 'nrb.sid';
}

export async function callSessionMethod(request: AuthenticatedRequest, method: SessionMethod): Promise<void> {
  const handler = request.session?.[method];
  if (typeof handler !== 'function') {
    return;
  }

  if (handler.length > 0) {
    await new Promise<void>((resolve, reject) => {
      (handler as (callback: (error?: unknown) => void) => void).call(request.session, (error?: unknown) => {
        if (error) {
          reject(error instanceof Error ? error : new Error('Session lifecycle method failed.'));
          return;
        }
        resolve();
      });
    });
    return;
  }

  const result = (handler as () => Promise<void> | void).call(request.session);
  if (result) {
    await result;
  }
}

export async function establishRequestSession(request: AuthenticatedRequest, session: AuthSessionView): Promise<void> {
  await callSessionMethod(request, 'regenerate');
  setSessionPrincipal(request, toSessionPrincipal(session));
  await callSessionMethod(request, 'save');
}

export async function establishExternalSessionIfPresent(
  request: AuthenticatedRequest,
  result: { session?: AuthSessionView },
): Promise<void> {
  if (result.session) {
    await establishRequestSession(request, result.session);
  }
}

function clearSessionCookie(request: AuthenticatedRequest, response?: AuthenticatedResponse): void {
  const cookieName = getSessionCookieName();
  const options = { path: '/' };
  request.res?.clearCookie?.(cookieName, options);
  request.reply?.clearCookie?.(cookieName, options);
  request.raw?.res?.clearCookie?.(cookieName, options);
  response?.clearCookie?.(cookieName, options);
}

export async function clearRequestSession(
  request: AuthenticatedRequest,
  response?: AuthenticatedResponse,
): Promise<void> {
  clearSessionPrincipal(request);
  await callSessionMethod(request, 'destroy');
  clearSessionCookie(request, response);
}
