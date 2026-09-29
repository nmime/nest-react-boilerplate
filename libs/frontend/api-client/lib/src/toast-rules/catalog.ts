import type { ApiToastCategory, ApiToastDisplay } from '@app/frontend-api-support';

import adminToastConfig from '../generated/toast/admin-app-api.toast-rules.frontend.generated.json';
import authToastConfig from '../generated/toast/auth-app-api.toast-rules.frontend.generated.json';
import userToastConfig from '../generated/toast/user-app-api.toast-rules.frontend.generated.json';

export interface ApiToastRuleCatalogItem {
  readonly app: string;
  readonly defaultDisplay: ApiToastDisplay;
  readonly defaultMessage: string;
  readonly defaultSeverity: ApiToastCategory;
  readonly errorCode: string | null;
  readonly id: string;
  readonly method: string;
  readonly operationId: string | null;
  readonly path: string;
  readonly status: number | string;
  readonly tags: readonly string[];
}

import type { GeneratedToastConfig } from './generated-config';

const catalogFrom = (config: GeneratedToastConfig): ApiToastRuleCatalogItem[] =>
  config.rules.map((rule) => ({
    id: rule.id,
    app: config.source.app,
    defaultDisplay: rule.display as ApiToastDisplay,
    defaultMessage: rule.catalog.defaultMessage,
    defaultSeverity: (rule.toast.category ?? config.defaults.toast.category) as ApiToastCategory,
    errorCode: rule.match.code ?? null,
    method: rule.match.method,
    operationId: rule.catalog.operationId,
    path: rule.match.endpoint,
    status: rule.match.status ?? rule.catalog.status ?? 'default',
    tags: rule.catalog.tags,
  }));

const allServiceCatalogs = (): ApiToastRuleCatalogItem[] => [
  ...catalogFrom(adminToastConfig),
  ...catalogFrom(authToastConfig),
  ...catalogFrom(userToastConfig),
];

// Pure annotations apply to calls, not array literals. A user-only build can
// discard this initializer and the unconsumed admin service's generated data.
export const apiToastRuleCatalog: readonly ApiToastRuleCatalogItem[] = /* @__PURE__ */ allServiceCatalogs();
