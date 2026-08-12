/**
 * `FormData` entries are `string | File`, so every form reader needs the same narrowing. It lives
 * here rather than being redeclared per app or feature, where it tends to degrade into an
 * `as string` cast that lies about file and missing entries.
 */
export const formValueToString = (value: FormDataEntryValue | null | undefined): string =>
  typeof value === 'string' ? value : '';

export const formTextField = (form: FormData, name: string): string => formValueToString(form.get(name));
