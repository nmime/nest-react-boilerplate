import { parseApiToastRules, type ApiToastRule } from '@app/frontend-api-support';

import authToastConfig from '../generated/toast/auth-app-api.toast-rules.frontend.generated.json';

export const authApiToastRules: readonly ApiToastRule[] = /* @__PURE__ */ parseApiToastRules(authToastConfig.rules);
