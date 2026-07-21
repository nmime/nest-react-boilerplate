import type { AuthUserEntity } from '../../entities';

export interface AuthUserRepositoryError {
  code: 'repository_error';
  message: string;
}

export interface AuthUserListInput {
  tenantId?: string;
  search?: string;
  status?: AuthUserEntity['status'];
  role?: string;
  permission?: string;
  locale?: AuthUserEntity['locale'];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  limit?: number;
  offset?: number;
}
