import type { AdminUserMutationSafetyViolation } from "../type/admin-user-mutation.type";

export class AdminUserMutationSafetyError extends Error {
  constructor(readonly violation: AdminUserMutationSafetyViolation) {
    super(violation.message);
    this.name = "AdminUserMutationSafetyError";
  }
}
