import { type ApiToastRule } from '@app/frontend-api-support';

import { parseGeneratedToastRules } from './generated-config';

import authToastConfig from '../generated/toast/auth-app-api.toast-rules.frontend.generated.json';

export const authApiToastRules: readonly ApiToastRule[] = /* @__PURE__ */ parseGeneratedToastRules(authToastConfig);
