import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

export type AuthUserTokenPurpose = 'email_verification' | 'password_reset';

export class AuthUserTokenEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId!: string;
  purpose!: AuthUserTokenPurpose;
  tokenHash!: string;
  expiresAt!: Date;
  consumedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const AuthUserTokenEntitySchema = new EntitySchema<AuthUserTokenEntity>({
  class: AuthUserTokenEntity,
  tableName: 'auth_user_tokens',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    userId: { type: 'uuid', fieldName: 'user_id' },
    purpose: { type: 'varchar', length: 32 },
    tokenHash: { type: 'varchar', fieldName: 'token_hash', length: 128 },
    expiresAt: { type: 'timestamptz', fieldName: 'expires_at' },
    consumedAt: {
      type: 'timestamptz',
      fieldName: 'consumed_at',
      nullable: true,
    },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [
    {
      name: 'ix__auth_user_tokens__tenant_id_user_id',
      properties: ['tenantId', 'userId'],
    },
    { name: 'ix__auth_user_tokens__purpose', properties: ['purpose'] },
    { name: 'ix__auth_user_tokens__expires_at', properties: ['expiresAt'] },
  ],
  uniques: [{ name: 'uq__auth_user_tokens__token_hash', properties: ['tokenHash'] }],
});
