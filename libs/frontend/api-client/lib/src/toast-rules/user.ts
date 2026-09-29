import { type ApiToastRule } from '@app/frontend-api-support';

import { parseGeneratedToastRules } from './generated-config';

import userToastConfig from '../generated/toast/user-app-api.toast-rules.frontend.generated.json';

export const userApiToastRules: readonly ApiToastRule[] = /* @__PURE__ */ parseGeneratedToastRules(userToastConfig);
