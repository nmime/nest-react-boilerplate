import { Component, type ErrorInfo, type ReactNode } from "react";

export interface UiLoadingProps {
  label?: string;
}

export const UiLoading = ({
  label = "Loading...",
}: Readonly<UiLoadingProps>) => (
  <div
    aria-live="polite"
    className="xr-feedback xr-feedback--loading"
    role="status"
  >
    {label}
  </div>
);

export interface UiEmptyStateProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export const UiEmptyState = ({
  action,
  description,
  title,
}: Readonly<UiEmptyStateProps>) => (
  <section className="xr-feedback xr-feedback--empty">
    <h2>{title}</h2>
    <p>{description}</p>
    {action ? <div className="xr-feedback__action">{action}</div> : null}
  </section>
);

export interface UiToastProps {
  message: string;
  tone?: "info" | "success" | "warning";
}

export const UiToast = ({ message, tone = "info" }: Readonly<UiToastProps>) => (
  <div className={`xr-toast xr-toast--${tone}`} role="status">
    {message}
  </div>
);

export interface UiErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface UiErrorBoundaryState {
  hasError: boolean;
}

export class UiErrorBoundary extends Component<
  UiErrorBoundaryProps,
  UiErrorBoundaryState
> {
  override state: UiErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): UiErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <>
          {this.props.fallback ?? (
            <UiEmptyState
              description="Try refreshing the page. If the issue continues, contact support with the request id from the API response."
              title="Something went wrong"
            />
          )}
        </>
      );
    }

    return <>{this.props.children}</>;
  }
}
