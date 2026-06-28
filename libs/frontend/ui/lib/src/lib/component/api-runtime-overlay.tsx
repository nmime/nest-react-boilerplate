/* v8 ignore file -- exercised by app-level integration and browser smoke tests. */
import type { ReactNode } from "react";
import { UiButton } from "./button";
import { UiDialog } from "./dialog";
import { UiToast } from "./feedback";
import { UiNotification } from "./notification";
import { cn } from "../utils/cn";

export interface UiRuntimeToast {
  category: "error" | "info" | "success" | "warning";
  id: string;
  message?: string;
  title: string;
}

export interface UiApiRuntimeOverlayProps {
  authAction?: ReactNode;
  authRequired?: boolean;
  className?: string;
  lastError?: { message: string } | null;
  onDismissToast?: (id: string) => void;
  redirectTo?: string | null;
  status?: "online" | "offline" | "server-error";
  toasts?: readonly UiRuntimeToast[];
}

const toastTone = (
  category: UiRuntimeToast["category"],
): "info" | "success" | "warning" => {
  if (category === "success") return "success";
  if (category === "warning" || category === "error") return "warning";
  return "info";
};

const toastMessage = (toast: UiRuntimeToast): string =>
  toast.message ? `${toast.title}: ${toast.message}` : toast.title;

const apiNotificationsLabel = "API notifications";
const apiRuntimeStatusLabel = "API runtime status";
const authRequiredTitle = "Authentication required";
const continueToSignInLabel = "Continue to sign in";
const defaultAuthDescription =
  "Your session must be refreshed before this route can load protected data.";
const defaultOfflineMessage =
  "You are offline. We will keep this route mounted while the connection recovers.";
const defaultServerErrorMessage =
  "The API is temporarily unavailable. Please retry in a moment.";
const dismissLabel = "Dismiss";
const offlineTitle = "Offline mode";
const serverErrorTitle = "Service interruption";

export const UiApiRuntimeOverlay = ({
  authAction,
  authRequired = false,
  className,
  lastError,
  onDismissToast,
  redirectTo,
  status = "online",
  toasts = [],
}: Readonly<UiApiRuntimeOverlayProps>) => {
  const isOffline = status === "offline";
  const isServerError = status === "server-error";

  return (
    <aside
      aria-label={apiRuntimeStatusLabel}
      className={cn("xr-runtime-overlay", className)}
      data-runtime-status={status}
    >
      {isOffline || isServerError ? (
        <UiNotification
          className="xr-runtime-overlay__banner"
          message={
            lastError?.message ??
            (isOffline ? defaultOfflineMessage : defaultServerErrorMessage)
          }
          role="alert"
          title={isOffline ? offlineTitle : serverErrorTitle}
          tone="warning"
        />
      ) : null}
      <div
        aria-label={apiNotificationsLabel}
        aria-live="polite"
        className="xr-runtime-overlay__toasts"
        role="status"
      >
        {toasts.map((toast) => (
          <div className="xr-runtime-overlay__toast" key={toast.id}>
            <UiToast
              message={toastMessage(toast)}
              tone={toastTone(toast.category)}
            />
            {onDismissToast ? (
              <UiButton
                aria-label={`Dismiss ${toast.title}`}
                onClick={() => onDismissToast(toast.id)}
                variant="secondary"
              >
                {dismissLabel}
              </UiButton>
            ) : null}
          </div>
        ))}
      </div>
      <UiDialog
        className="xr-api-runtime-dialog"
        description={lastError?.message ?? defaultAuthDescription}
        open={authRequired}
        title={authRequiredTitle}
      >
        {authAction ?? (
          <UiButton href={redirectTo ?? "/auth"}>
            {continueToSignInLabel}
          </UiButton>
        )}
      </UiDialog>
    </aside>
  );
};
