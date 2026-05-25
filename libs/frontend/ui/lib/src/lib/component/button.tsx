import type { ReactNode } from "react";

export interface UiButtonProps {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary";
}

export const UiButton = ({
  children,
  href,
  variant = "primary",
}: Readonly<UiButtonProps>) => {
  const className = `xr-button xr-button--${variant}`;

  if (href) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={className} type="button">
      {children}
    </button>
  );
};
