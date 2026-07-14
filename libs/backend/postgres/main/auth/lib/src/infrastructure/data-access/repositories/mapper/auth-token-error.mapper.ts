import type { AuthTokenRepositoryError } from '../type/auth-token.type';

export function mapAuthTokenRepositoryError(cause: unknown): AuthTokenRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Auth token repository failed.',
  };
}
