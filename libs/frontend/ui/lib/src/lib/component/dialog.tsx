/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { UiButton } from "./button";
import { cn } from "../utils/cn";

export interface UiDialogProps {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  trigger?: ReactNode;
}

export const UiDialog = ({
  children,
  className,
  description,
  onOpenChange,
  open,
  title,
  trigger,
}: Readonly<UiDialogProps>) => (
  <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
    {trigger ? (
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
    ) : null}
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="xr-dialog__overlay" />
      <DialogPrimitive.Content
        className={cn("xr-dialog", className)}
        data-admin-primitive="dialog"
      >
        <div className="xr-dialog__header">
          <DialogPrimitive.Title className="xr-dialog__title">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="xr-dialog__description">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        <div className="xr-dialog__body">{children}</div>
        <DialogPrimitive.Close asChild>
          <UiButton className="xr-dialog__close" variant="secondary">
            Close
          </UiButton>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export interface UiConfirmDialogProps {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  description: ReactNode;
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  trigger?: ReactNode;
}

export const UiConfirmDialog = ({
  cancelLabel = "Cancel",
  children,
  confirmLabel = "Confirm",
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
  trigger,
}: Readonly<UiConfirmDialogProps>) => (
  <AlertDialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
    {trigger ? (
      <AlertDialogPrimitive.Trigger asChild>
        {trigger}
      </AlertDialogPrimitive.Trigger>
    ) : null}
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="xr-dialog__overlay" />
      <AlertDialogPrimitive.Content
        className="xr-dialog xr-dialog--confirm"
        data-admin-primitive="confirm-dialog"
      >
        <AlertDialogPrimitive.Title className="xr-dialog__title">
          {title}
        </AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="xr-dialog__description">
          {description}
        </AlertDialogPrimitive.Description>
        {children ? <div className="xr-dialog__body">{children}</div> : null}
        <div className="xr-dialog__footer">
          <AlertDialogPrimitive.Cancel asChild>
            <UiButton variant="secondary">{cancelLabel}</UiButton>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <UiButton onClick={onConfirm}>{confirmLabel}</UiButton>
          </AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>
);
