import { useCallback, useEffect, useReducer } from "react";

import { apiRuntimeEvents, type ApiRuntimeEventHub } from "./runtime-events";
import { emitBrowserOfflineEvent } from "./runtime-fetch";
import { apiToastRuntime, type ApiToastRuntime } from "./toast-runtime";

export interface ApiRuntimeOverlayModelOptions {
  eventHub?: ApiRuntimeEventHub;
  toastRuntime?: ApiToastRuntime;
}

export const resetApiRuntimeForOnline = (
  eventHub: ApiRuntimeEventHub = apiRuntimeEvents,
): void => {
  eventHub.reset();
};

export const clearApiAuthRequired = (
  eventHub: ApiRuntimeEventHub = apiRuntimeEvents,
): void => {
  eventHub.clearAuthRequired();
};

export function useApiRuntimeOverlayModel({
  eventHub = apiRuntimeEvents,
  toastRuntime = apiToastRuntime,
}: ApiRuntimeOverlayModelOptions = {}) {
  const rerender = useReducer((version: number) => version + 1, 0)[1];

  useEffect(() => eventHub.subscribe(() => rerender()), [eventHub, rerender]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleOffline = () => emitBrowserOfflineEvent(eventHub);
    const handleOnline = () => {
      eventHub.reset();
      rerender();
    };

    if (globalThis.navigator && navigator.onLine === false) {
      handleOffline();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [eventHub, rerender]);

  const dismissToast = useCallback(
    (id: string) => {
      toastRuntime.dismiss(id);
      rerender();
    },
    [rerender, toastRuntime],
  );

  return {
    dismissToast,
    state: eventHub.getState(),
    toasts: toastRuntime.visible,
  };
}
