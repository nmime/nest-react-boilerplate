/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type FormHTMLAttributes } from 'react';
import { cn } from '../util/cn';

export type UiFormProps = FormHTMLAttributes<HTMLFormElement>;

export const Form = forwardRef<HTMLFormElement, UiFormProps>(({ className, ...props }, ref) => (
  <form className={cn('xr-form grid gap-4', className)} data-slot="form" ref={ref} {...props} />
));

Form.displayName = 'Form';

export const UiForm = Form;
