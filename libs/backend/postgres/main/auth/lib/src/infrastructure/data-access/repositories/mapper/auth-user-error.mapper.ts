import type { AuthUserRepositoryError } from '../type/auth-user.type';

export function mapAuthUserRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Auth user repository failed.',
  };
}
