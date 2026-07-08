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
import { cn } from "../util/cn";

export type CheckboxProps = ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
>;

export const Checkbox = forwardRef<
  ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, children, ...props }, ref) => (
  <CheckboxPrimitive.Root
    className={cn("xr-checkbox", className)}
    data-slot="checkbox"
    ref={ref}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className="xr-checkbox__indicator"
      data-slot="checkbox-indicator"
    >
      {children ?? "✓"}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = "Checkbox";

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
      <Checkbox
        {...props}
        aria-describedby={descriptionId}
        className={className}
        id={controlId}
        ref={ref}
      />
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

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn("xr-switch", className)}
    data-slot="switch"
    ref={ref}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className="xr-switch__thumb"
      data-slot="switch-thumb"
    />
  </SwitchPrimitive.Root>
));

Switch.displayName = "Switch";

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
      <Switch
        {...props}
        aria-describedby={descriptionId}
        className={className}
        id={controlId}
        ref={ref}
      />
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
