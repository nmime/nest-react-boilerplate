export const formValueToString = (
  value: FormDataEntryValue | null | undefined,
): string => (typeof value === "string" ? value : "");
