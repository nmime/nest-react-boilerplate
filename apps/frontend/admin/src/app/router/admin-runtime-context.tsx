import { createContext, useContext } from 'react';
import type { ApiClientRequestOptions } from '@app/frontend-api-client';
import type { AdminProfileState } from '../../shared';

/**
 * Per-render admin session state provided above the router (via plain React
 * context) so the shell and every route component can read the RBAC access
 * state, request options, and sign-out control without threading props.
 */
export interface AdminRuntime {
  state: AdminProfileState;
  requestOptions?: ApiClientRequestOptions;
  isSigningOut: boolean;
  onSignOut: () => void;
}

const AdminRuntimeContext = createContext<AdminRuntime | null>(null);

export const AdminRuntimeProvider = AdminRuntimeContext.Provider;

export const useAdminRuntime = (): AdminRuntime => {
  const runtime = useContext(AdminRuntimeContext);
  /* v8 ignore next 3 -- provider always wraps the router; guard keeps the hook total. */
  if (!runtime) {
    throw new Error('useAdminRuntime must be used within AdminRuntimeProvider.');
  }
  return runtime;
};
