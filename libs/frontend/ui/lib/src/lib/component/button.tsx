import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary";

interface BaseUiButtonProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
}

type NativeButtonProps = BaseUiButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseUiButtonProps> & {
    href?: never;
  };

type AnchorButtonProps = BaseUiButtonProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof BaseUiButtonProps | "href" | "type"
  > & {
    href: string;
  };

export type UiButtonProps = NativeButtonProps | AnchorButtonProps;

const classNames = (...values: Array<string | undefined | false>): string =>
  values.filter(Boolean).join(" ");

const buildClassName = ({
  className,
  isLoading,
  variant = "primary",
}: Pick<BaseUiButtonProps, "className" | "isLoading" | "variant">) =>
  classNames(
    "xr-button",
    `xr-button--${variant}`,
    isLoading && "xr-button--loading",
    className,
  );

const getAccessibleRel = (
  rel: AnchorButtonProps["rel"],
  target: AnchorButtonProps["target"],
): string | undefined => {
  if (target !== "_blank") {
    return rel;
  }

  const relTokens = new Set(["noopener", "noreferrer"]);

  rel
    ?.split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => relTokens.add(token));

  return Array.from(relTokens).join(" ");
};

const renderButtonContent = (
  children: ReactNode,
  isLoading: boolean,
  loadingLabel: string,
): ReactElement => {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <>
      <span aria-hidden="true" className="xr-button__content">
        {children}
      </span>
      <span className="xr-button__loading-label">{loadingLabel}</span>
    </>
  );
};

export const UiButton = ({
  children,
  className,
  disabled = false,
  isLoading = false,
  loadingLabel = "Loading",
  variant = "primary",
  ...interactiveProps
}: Readonly<UiButtonProps>) => {
  const isUnavailable = disabled || isLoading;
  const buttonClassName = buildClassName({ className, isLoading, variant });
  const content = renderButtonContent(children, isLoading, loadingLabel);

  if ("href" in interactiveProps && interactiveProps.href !== undefined) {
    const { href, onClick, rel, target, ...anchorProps } =
      interactiveProps as AnchorButtonProps;

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (isUnavailable) {
        event.preventDefault();
        return;
      }

      onClick?.(event);
    };

    return (
      <a
        {...anchorProps}
        aria-busy={isLoading || undefined}
        aria-disabled={isUnavailable || undefined}
        className={buttonClassName}
        href={href}
        onClick={handleClick}
        rel={getAccessibleRel(rel, target)}
        tabIndex={isUnavailable ? -1 : anchorProps.tabIndex}
        target={target}
      >
        {content}
      </a>
    );
  }

  const {
    onClick,
    type = "button",
    ...buttonProps
  } = interactiveProps as NativeButtonProps;

  return (
    <button
      {...buttonProps}
      aria-busy={isLoading || undefined}
      className={buttonClassName}
      disabled={isUnavailable}
      onClick={onClick}
      type={type}
    >
      {content}
    </button>
  );
};
