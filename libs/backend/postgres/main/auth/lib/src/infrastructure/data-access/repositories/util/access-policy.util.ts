import type { AuthUserAccessPolicyInput, AuthUserEntity } from "../../entities";

export function applyAccessPolicy(
  entity: AuthUserEntity,
  policy: AuthUserAccessPolicyInput,
): void {
  if (policy.status) {
    entity.status = policy.status;
  }
  if (policy.roles) {
    entity.roles = [...policy.roles];
  }
  if (policy.permissions) {
    entity.permissions = [...policy.permissions];
  }
}
