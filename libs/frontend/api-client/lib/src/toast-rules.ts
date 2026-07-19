import {
  parseApiToastRules,
  type ApiToastCategory,
  type ApiToastDisplay,
  type ApiToastRule,
} from '@app/frontend-api-support';

import adminToastConfig from './generated/toast/admin-app-api.toast-rules.frontend.generated.json';
import authToastConfig from './generated/toast/auth-app-api.toast-rules.frontend.generated.json';
import userToastConfig from './generated/toast/user-app-api.toast-rules.frontend.generated.json';

export const adminApiToastRules: readonly ApiToastRule[] = parseApiToastRules(adminToastConfig.rules);
export const authApiToastRules: readonly ApiToastRule[] = parseApiToastRules(authToastConfig.rules);
export const userApiToastRules: readonly ApiToastRule[] = parseApiToastRules(userToastConfig.rules);

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

interface GeneratedCatalogRule {
  readonly catalog: Omit<ApiToastRuleCatalogItem, 'id'>;
  readonly id: string;
}

const catalogFrom = (rules: readonly unknown[]): ApiToastRuleCatalogItem[] =>
  (rules as readonly GeneratedCatalogRule[]).map((rule) => ({ id: rule.id, ...rule.catalog }));

export const apiToastRuleCatalog: readonly ApiToastRuleCatalogItem[] = [
  ...catalogFrom(adminToastConfig.rules),
  ...catalogFrom(authToastConfig.rules),
  ...catalogFrom(userToastConfig.rules),
];
