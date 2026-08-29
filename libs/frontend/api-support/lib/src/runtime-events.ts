export type ApiRuntimeStatus = 'online' | 'offline' | 'server-error';

export interface ApiRuntimePresentationSnapshot {
  customDescription?: string;
  display: 'custom' | 'modal';
  figmaOnly: boolean;
  lines: readonly string[];
  ruleId: string;
  severity: 'error' | 'info' | 'success' | 'warning';
  support: boolean;
}

export type ApiRuntimeEvent =
  | {
      type: 'request-succeeded';
    }
  | {
      type: 'network-offline';
      error: NormalizedApiErrorSnapshot;
    }
  | {
      type: 'server-error';
      error: NormalizedApiErrorSnapshot;
    }
  | {
      type: 'auth-required';
      reason: 'unauthenticated' | 'missing-token' | 'refresh-failed' | 'retry-rejected';
      error?: NormalizedApiErrorSnapshot;
      redirectTo?: string;
    }
  | {
      type: 'toast';
      toast: ApiRuntimeToastSnapshot;
    }
  | {
      type: 'presentation';
      presentation: ApiRuntimePresentationSnapshot;
    };

export interface NormalizedApiErrorSnapshot {
  code: string;
  endpoint?: string;
  id: string;
  kind: string;
  message: string;
  method?: string;
  status: number | null;
  type?: string;
}

export interface ApiRuntimeToastSnapshot {
  category: string;
  id: string;
  message?: string;
  title: string;
}

export interface ApiRuntimeState {
  authRequired: boolean;
  lastError: NormalizedApiErrorSnapshot | null;
  presentation: ApiRuntimePresentationSnapshot | null;
  redirectTo: string | null;
  status: ApiRuntimeStatus;
}

export type ApiRuntimeEventListener = (event: ApiRuntimeEvent) => void;

export interface ApiRuntimeEventHub {
  clearAuthRequired: () => void;
  clearPresentation: () => void;
  emit: (event: ApiRuntimeEvent) => void;
  getState: () => ApiRuntimeState;
  reset: () => void;
  subscribe: (listener: ApiRuntimeEventListener) => () => void;
}

const initialState = (): ApiRuntimeState => ({
  authRequired: false,
  lastError: null,
  presentation: null,
  redirectTo: null,
  status: 'online',
});

export const createApiRuntimeEventHub = (): ApiRuntimeEventHub => {
  const listeners = new Set<ApiRuntimeEventListener>();
  let state = initialState();

  const emit = (event: ApiRuntimeEvent): void => {
    if (event.type === 'request-succeeded') {
      state = { ...state, lastError: null, status: 'online' };
    }

    if (event.type === 'network-offline') {
      state = { ...state, lastError: event.error, status: 'offline' };
    }

    if (event.type === 'server-error') {
      state = { ...state, lastError: event.error, status: 'server-error' };
    }

    if (event.type === 'presentation') {
      state = { ...state, presentation: event.presentation };
    }

    if (event.type === 'auth-required') {
      state = {
        ...state,
        authRequired: true,
        lastError: event.error ?? state.lastError,
        redirectTo: event.redirectTo ?? state.redirectTo,
      };
    }

    listeners.forEach((listener) => {
      listener(event);
    });
  };

  return {
    clearAuthRequired: () => {
      state = {
        ...state,
        authRequired: false,
        redirectTo: null,
      };
    },
    clearPresentation: () => {
      state = { ...state, presentation: null };
    },
    emit,
    getState: () => state,
    reset: () => {
      state = initialState();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const apiRuntimeEvents = createApiRuntimeEventHub();
