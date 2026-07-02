import {
  parseApiToastRules,
  type ApiToastRule,
} from "@app/frontend/api-support";

import adminToastConfig from "../generated/toast/admin-app-api.toast-rules.frontend.generated.json";
import authToastConfig from "../generated/toast/auth-app-api.toast-rules.frontend.generated.json";
import userToastConfig from "../generated/toast/user-app-api.toast-rules.frontend.generated.json";

export const adminApiToastRules: readonly ApiToastRule[] = parseApiToastRules(
  adminToastConfig.rules,
);
export const authApiToastRules: readonly ApiToastRule[] = parseApiToastRules(
  authToastConfig.rules,
);
export const userApiToastRules: readonly ApiToastRule[] = parseApiToastRules(
  userToastConfig.rules,
);
