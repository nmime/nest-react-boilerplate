/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { UiButton } from "./button";
import { cn } from "../util/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export type DialogOverlayProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Overlay
>;

export const DialogOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn("xr-dialog__overlay", className)}
    data-slot="dialog-overlay"
    ref={ref}
    {...props}
  />
));

DialogOverlay.displayName = "DialogOverlay";

export type DialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
>;

export const DialogContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn("xr-dialog", className)}
      data-slot="dialog-content"
      ref={ref}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));

DialogContent.displayName = "DialogContent";

export type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;

export const DialogHeader = ({
  className,
  ...props
}: Readonly<DialogHeaderProps>) => (
  <div
    className={cn("xr-dialog__header", className)}
    data-slot="dialog-header"
    {...props}
  />
);

export type DialogFooterProps = HTMLAttributes<HTMLDivElement>;

export const DialogFooter = ({
  className,
  ...props
}: Readonly<DialogFooterProps>) => (
  <div
    className={cn("xr-dialog__footer", className)}
    data-slot="dialog-footer"
    {...props}
  />
);

export type DialogTitleProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Title
>;

export const DialogTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    className={cn("xr-dialog__title", className)}
    data-slot="dialog-title"
    ref={ref}
    {...props}
  />
));

DialogTitle.displayName = "DialogTitle";

export type DialogDescriptionProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Description
>;

export const DialogDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    className={cn("xr-dialog__description", className)}
    data-slot="dialog-description"
    ref={ref}
    {...props}
  />
));

DialogDescription.displayName = "DialogDescription";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export type AlertDialogOverlayProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Overlay
>;

export const AlertDialogOverlay = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  AlertDialogOverlayProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn("xr-dialog__overlay", className)}
    data-slot="alert-dialog-overlay"
    ref={ref}
    {...props}
  />
));

AlertDialogOverlay.displayName = "AlertDialogOverlay";

export type AlertDialogContentProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Content
>;

export const AlertDialogContent = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, children, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      className={cn("xr-dialog xr-dialog--confirm", className)}
      data-slot="alert-dialog-content"
      ref={ref}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Content>
  </AlertDialogPortal>
));

AlertDialogContent.displayName = "AlertDialogContent";

export const AlertDialogHeader = DialogHeader;

export const AlertDialogFooter = DialogFooter;

export type AlertDialogTitleProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Title
>;

export const AlertDialogTitle = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Title>,
  AlertDialogTitleProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    className={cn("xr-dialog__title", className)}
    data-slot="alert-dialog-title"
    ref={ref}
    {...props}
  />
));

AlertDialogTitle.displayName = "AlertDialogTitle";

export type AlertDialogDescriptionProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Description
>;

export const AlertDialogDescription = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Description>,
  AlertDialogDescriptionProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    className={cn("xr-dialog__description", className)}
    data-slot="alert-dialog-description"
    ref={ref}
    {...props}
  />
));

AlertDialogDescription.displayName = "AlertDialogDescription";

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
  <Dialog onOpenChange={onOpenChange} open={open}>
    {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
    <DialogContent className={className} data-admin-primitive="dialog">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <div className="xr-dialog__body">{children}</div>
      <DialogClose asChild>
        <UiButton className="xr-dialog__close" variant="secondary">
          Close
        </UiButton>
      </DialogClose>
    </DialogContent>
  </Dialog>
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
  <AlertDialog onOpenChange={onOpenChange} open={open}>
    {trigger ? (
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
    ) : null}
    <AlertDialogContent data-admin-primitive="confirm-dialog">
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{description}</AlertDialogDescription>
      {children ? <div className="xr-dialog__body">{children}</div> : null}
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <UiButton variant="secondary">{cancelLabel}</UiButton>
        </AlertDialogCancel>
        <AlertDialogAction asChild>
          <UiButton onClick={onConfirm}>{confirmLabel}</UiButton>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
