import type { AuthRoleRepositoryError } from '../type/auth-role.type';

export function mapAuthRoleRepositoryError(cause: unknown): AuthRoleRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Auth role repository failed.',
  };
}
