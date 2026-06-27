import {
  normalizeTenantId,
  resolveTenantId,
} from "@app/backend/feature/auth/shared";

export class InvalidAuthTenantIdError extends Error {
  constructor() {
    super("Invalid tenant id.");
    this.name = "InvalidAuthTenantIdError";
  }
}

export function parseTenantId(value: string | null | undefined): string {
  if (value && !normalizeTenantId(value)) {
    throw new InvalidAuthTenantIdError();
  }

  return resolveTenantId(value);
}
