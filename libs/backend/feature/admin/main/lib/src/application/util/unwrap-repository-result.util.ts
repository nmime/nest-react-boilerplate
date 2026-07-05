import type { Result } from "neverthrow";
import {
  AdminApplicationError,
  isSensitiveAdminPolicyMessage,
} from "../admin-errors";

export const unwrapRepositoryResult = <T>(
  result: Result<T, { message?: string }>,
): T => {
  if (result.isOk()) {
    return result.value;
  }

  throw new AdminApplicationError(
    "repository_error",
    result.error.message ?? "Admin repository operation failed.",
  );
};

export const unwrapSensitiveMutationResult = <T>(
  result: Result<T, { message?: string }>,
): T => {
  if (result.isOk()) {
    return result.value;
  }

  const message = result.error.message ?? "Admin repository operation failed.";
  if (isSensitiveAdminPolicyMessage(message)) {
    throw new AdminApplicationError("sensitive_policy_violation", message);
  }

  throw new AdminApplicationError("repository_error", message);
};
