/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import {
  Component,
  useId,
  type ErrorInfo,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { translate } from "@app/common/i18n";

type UiLiveMode = "polite" | "assertive";

const classNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(" ");

export interface UiLoadingProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  live?: UiLiveMode;
}

export const UiLoading = ({
  className,
  label = translate("common.loading"),
  live = "polite",
  role,
  ...props
}: Readonly<UiLoadingProps>) => (
  <div
    {...props}
    aria-live={live}
    className={classNames("xr-feedback", "xr-feedback--loading", className)}
    role={role ?? "status"}
  >
    {label}
  </div>
);

export interface UiEmptyStateProps extends HTMLAttributes<HTMLElement> {
  action?: ReactNode;
  description: string;
  descriptionId?: string;
  title: string;
  titleId?: string;
}

export const UiEmptyState = ({
  action,
  className,
  description,
  descriptionId,
  title,
  titleId,
  ...props
}: Readonly<UiEmptyStateProps>) => {
  const generatedDescriptionId = useId();
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const copyId = descriptionId ?? generatedDescriptionId;
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-labelledby": ariaLabelledBy,
    ...sectionProps
  } = props;

  return (
    <section
      {...sectionProps}
      aria-describedby={ariaDescribedBy ?? copyId}
      aria-labelledby={ariaLabelledBy ?? headingId}
      className={classNames("xr-feedback", "xr-feedback--empty", className)}
    >
      <h2 id={headingId}>{title}</h2>
      <p id={copyId}>{description}</p>
      {action ? <div className="xr-feedback__action">{action}</div> : null}
    </section>
  );
};

export interface UiToastProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  tone?: "info" | "success" | "warning";
  live?: UiLiveMode;
}

export const UiToast = ({
  className,
  live,
  message,
  role,
  tone = "info",
  ...props
}: Readonly<UiToastProps>) => {
  const resolvedLive = live ?? (tone === "warning" ? "assertive" : "polite");
  const resolvedRole = role ?? (tone === "warning" ? "alert" : "status");

  return (
    <div
      {...props}
      aria-live={resolvedLive}
      className={classNames("xr-toast", `xr-toast--${tone}`, className)}
      role={resolvedRole}
    >
      {message}
    </div>
  );
};

export interface UiErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
  resetKey?: number | string;
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

  override componentDidUpdate(previousProps: UiErrorBoundaryProps): void {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.props.onReset?.();
      this.setState({ hasError: false });
    }
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
              description={translate("ui.errorBoundary.description")}
              title={translate("ui.errorBoundary.title")}
            />
          )}
        </>
      );
    }

    return <>{this.props.children}</>;
  }
}
