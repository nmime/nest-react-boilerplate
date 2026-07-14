import { AdminUserMutationRepositoryError } from '../const/admin-user-mutation.const';
import { AdminUserMutationSafetyError } from '../exception/admin-user-mutation-safety.exception';
import type { AuthUserRepositoryError } from '../type/auth-user.type';

export function mapAdminUserMutationRepositoryError(cause: unknown): AuthUserRepositoryError {
  if (cause instanceof AdminUserMutationSafetyError) {
    return {
      code: AdminUserMutationRepositoryError,
      message: cause.message,
    };
  }

  return {
    code: AdminUserMutationRepositoryError,
    message: cause instanceof Error ? cause.message : 'Admin user mutation repository failed.',
  };
}
