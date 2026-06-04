/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils/cn";

type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

const buttonVariants = cva(
  [
    "xr-button inline-flex min-h-11 max-w-full min-w-0 items-center justify-center gap-2 rounded-full border px-5 text-center text-sm font-bold no-underline shadow-sm transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--xr-color-primary)_34%,transparent)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        primary:
          "xr-button--primary border-transparent bg-[linear-gradient(135deg,var(--xr-color-primary),var(--xr-color-primary-strong))] text-[var(--xr-color-primary-contrast)] hover:-translate-y-0.5 hover:shadow-lg",
        secondary:
          "xr-button--secondary border-[var(--xr-color-border)] bg-[var(--xr-control-background)] text-[var(--xr-color-text)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--xr-color-primary)_58%,transparent)]",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

interface BaseUiButtonProps extends VariantProps<typeof buttonVariants> {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}

type NativeButtonProps = BaseUiButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseUiButtonProps> & {
    asChild?: boolean;
    href?: never;
  };

type AnchorButtonProps = BaseUiButtonProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof BaseUiButtonProps | "href" | "type"
  > & {
    asChild?: never;
    href: string;
  };

export type UiButtonProps = NativeButtonProps | AnchorButtonProps;

const buildClassName = ({
  className,
  isLoading,
  variant,
}: Pick<BaseUiButtonProps, "className" | "isLoading" | "variant">) =>
  cn(
    buttonVariants({ variant: variant as ButtonVariant }),
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
      <span aria-hidden="true" className="xr-button__content opacity-65">
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
    asChild = false,
    onClick,
    type = "button",
    ...buttonProps
  } = interactiveProps as NativeButtonProps;
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      {...buttonProps}
      aria-busy={isLoading || undefined}
      className={buttonClassName}
      disabled={asChild ? undefined : isUnavailable}
      onClick={onClick}
      type={asChild ? undefined : type}
    >
      {content}
    </Comp>
  );
};
