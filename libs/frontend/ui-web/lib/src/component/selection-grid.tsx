/* v8 ignore file -- exercised by integration, browser, and Storybook interaction tests. */
import { type ReactNode } from 'react';
import { UiCheckbox } from './choice-controls';
import { cn } from '../util/cn';

export interface UiSelectionGridOption {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface UiSelectionGridProps {
  className?: string;
  disabled?: boolean;
  label: string;
  onValuesChange: (values: string[]) => void;
  options: readonly UiSelectionGridOption[];
  values: readonly string[];
}

export const UiSelectionGrid = ({
  className,
  disabled = false,
  label,
  onValuesChange,
  options,
  values,
}: Readonly<UiSelectionGridProps>) => {
  const selected = new Set(values);

  return (
    <fieldset className={cn('xr-selection-grid', className)}>
      <legend className="xr-selection-grid__legend">{label}</legend>
      <div className="xr-selection-grid__options">
        {options.map((option) => (
          <div className="xr-selection-grid__option" key={option.value}>
            <UiCheckbox
              checked={selected.has(option.value)}
              disabled={disabled || option.disabled}
              label={option.label}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked === true) {
                  next.add(option.value);
                } else {
                  next.delete(option.value);
                }
                onValuesChange(options.filter(({ value }) => next.has(value)).map(({ value }) => value));
              }}
            />
            {option.description ? <span className="xr-selection-grid__description">{option.description}</span> : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
};
