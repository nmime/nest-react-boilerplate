/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import { UiLabel } from "./label";
import { cn } from "../utils/cn";

export interface UiCheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "children"
> {
  description?: ReactNode;
  label: ReactNode;
}

export const UiCheckbox = forwardRef<
  ComponentRef<typeof CheckboxPrimitive.Root>,
  UiCheckboxProps
>(({ className, description, id, label, ...props }, ref) => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <div className="xr-choice">
      <CheckboxPrimitive.Root
        {...props}
        aria-describedby={descriptionId}
        className={cn("xr-checkbox", className)}
        id={controlId}
        ref={ref}
      >
        <CheckboxPrimitive.Indicator className="xr-checkbox__indicator">
          ✓
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="xr-choice__copy">
        <UiLabel htmlFor={controlId}>{label}</UiLabel>
        {description ? (
          <p className="xr-choice__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
});

UiCheckbox.displayName = "UiCheckbox";

export interface UiSwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  "children"
> {
  description?: ReactNode;
  label: ReactNode;
}

export const UiSwitch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  UiSwitchProps
>(({ className, description, id, label, ...props }, ref) => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <div className="xr-choice">
      <SwitchPrimitive.Root
        {...props}
        aria-describedby={descriptionId}
        className={cn("xr-switch", className)}
        id={controlId}
        ref={ref}
      >
        <SwitchPrimitive.Thumb className="xr-switch__thumb" />
      </SwitchPrimitive.Root>
      <div className="xr-choice__copy">
        <UiLabel htmlFor={controlId}>{label}</UiLabel>
        {description ? (
          <p className="xr-choice__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
});

UiSwitch.displayName = "UiSwitch";
