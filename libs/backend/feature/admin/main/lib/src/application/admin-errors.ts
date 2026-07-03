export type AdminApplicationErrorCode =
  | "invalid_access_policy"
  | "not_found"
  | "repository_error"
  | "sensitive_policy_violation";

export class AdminApplicationError extends Error {
  constructor(
    readonly code: AdminApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminApplicationError";
  }
}

export const isSensitiveAdminPolicyMessage = (message: string): boolean =>
  message ===
    "Administrators cannot remove their own active admin write access." ||
  message ===
    "At least one active administrator must retain admin write access.";
