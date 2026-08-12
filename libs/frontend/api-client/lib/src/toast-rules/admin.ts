import { parseApiToastRules, type ApiToastRule } from '@app/frontend-api-support';

import adminToastConfig from '../generated/toast/admin-app-api.toast-rules.frontend.generated.json';

// One service per module, and the initializer is annotated pure: an app that never references this
// export leaves the generated catalog (hundreds of kilobytes of JSON) out of its bundle.
export const adminApiToastRules: readonly ApiToastRule[] = /* @__PURE__ */ parseApiToastRules(adminToastConfig.rules);
