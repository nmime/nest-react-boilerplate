import { AuthUserEntity } from "../../entities";

export function cloneAuthUser(entity: AuthUserEntity): AuthUserEntity {
  const clone = new AuthUserEntity({
    tenantId: entity.tenantId,
    email: entity.email,
    displayName: entity.displayName,
    passwordHash: entity.passwordHash,
    status: entity.status,
    roles: [...entity.roles],
    permissions: [...entity.permissions],
    locale: entity.locale,
    theme: entity.theme,
    lastLoginAt: entity.lastLoginAt,
  });
  clone.id = entity.id;
  clone.createdAt = entity.createdAt;
  clone.updatedAt = entity.updatedAt;

  return clone;
}
