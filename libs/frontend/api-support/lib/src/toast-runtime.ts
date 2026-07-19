import { translate } from '@app/frontend-i18n-shared';
import { getApiLocale } from './api-locale';
import { apiRuntimeEvents, type ApiRuntimeEventHub } from './runtime-events';

export type ApiToastCategory = 'error' | 'info' | 'success' | 'warning';
export type ApiToastDisplay = 'custom' | 'modal' | 'silent' | 'toast';

export interface ApiToastMetadata {
  color: string;
  icon: string;
}

export interface ApiToastRuleMatch {
  code?: string;
  endpoint?: string;
  kind?: string;
  method?: string;
  status?: number;
  statusRange?: [number, number];
  type?: string;
}

export interface ApiToastRule {
  display?: ApiToastDisplay;
  id: string;
  match: ApiToastRuleMatch;
  toast: {
    category: ApiToastCategory;
    message?: string;
    title: string;
  };
}

export type ApiToastRulesSource = readonly ApiToastRule[] | (() => readonly ApiToastRule[]);

export interface ApiToastContext {
  code?: string;
  endpoint?: string;
  kind?: string;
  method?: string;
  status?: number | null;
  type?: string;
}

export interface ApiToast {
  category: ApiToastCategory;
  color: string;
  createdAt: number;
  icon: string;
  id: string;
  message?: string;
  title: string;
}

export interface ApiToastRuntimeOptions {
  clock?: () => number;
  createId?: () => string;
  eventHub?: ApiRuntimeEventHub;
  maxVisible?: number;
  rateLimitMs?: number;
}

export const ApiToastCategoryMetadata: Record<ApiToastCategory, ApiToastMetadata> = {
  error: { color: 'danger', icon: 'circle-alert' },
  info: { color: 'info', icon: 'circle-info' },
  success: { color: 'success', icon: 'circle-check' },
  warning: { color: 'warning', icon: 'triangle-alert' },
};

const ApiToastCategories: readonly ApiToastCategory[] = ['error', 'info', 'success', 'warning'];

const ApiToastDisplays: readonly ApiToastDisplay[] = ['custom', 'modal', 'silent', 'toast'];
const ApiToastCategoryValues: ReadonlySet<string> = new Set(ApiToastCategories);
const ApiToastDisplayValues: ReadonlySet<string> = new Set(ApiToastDisplays);

export const createDefaultApiToastRules = (): ApiToastRule[] => [
  {
    display: 'toast',
    id: 'api.network.offline',
    match: { kind: 'network' },
    toast: {
      category: 'warning',
      title: translate('ui.runtime.offline.title', { locale: getApiLocale() }),
      message: translate('ui.runtime.offline.description', { locale: getApiLocale() }),
    },
  },
  {
    display: 'toast',
    id: 'api.server.error',
    match: { statusRange: [500, 599] },
    toast: {
      category: 'error',
      title: translate('ui.runtime.serverUnavailable.title', { locale: getApiLocale() }),
      message: translate('ui.runtime.serverUnavailable.description', { locale: getApiLocale() }),
    },
  },
  {
    display: 'silent',
    id: 'api.auth.unauthorized',
    match: { status: 401 },
    toast: {
      category: 'info',
      title: translate('ui.runtime.authRequired.title', { locale: getApiLocale() }),
    },
  },
];

export const resolveApiToastRules = (source?: ApiToastRulesSource): readonly ApiToastRule[] =>
  typeof source === 'function' ? source() : (source ?? createDefaultApiToastRules());

const normalizeMethod = (method?: string): string | undefined => method?.toUpperCase();
const matchesOptional = <T>(expected: T | undefined, actual: T | undefined): boolean =>
  expected === undefined || expected === actual;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isApiToastCategory = (value: unknown): value is ApiToastCategory =>
  typeof value === 'string' && ApiToastCategoryValues.has(value);

const isApiToastDisplay = (value: unknown): value is ApiToastDisplay =>
  typeof value === 'string' && ApiToastDisplayValues.has(value);

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const readToastRuleMatch = (value: Record<string, unknown>): ApiToastRuleMatch => {
  const match: ApiToastRuleMatch = {};
  const code = readOptionalString(value.code);
  const endpoint = readOptionalString(value.endpoint);
  const kind = readOptionalString(value.kind);
  const method = readOptionalString(value.method);
  const type = readOptionalString(value.type);

  if (code) {
    match.code = code;
  }
  if (endpoint) {
    match.endpoint = endpoint;
  }
  if (kind) {
    match.kind = kind;
  }
  if (method) {
    match.method = method;
  }
  if (type) {
    match.type = type;
  }
  if (typeof value.status === 'number') {
    match.status = value.status;
  }
  if (isUnknownArray(value.statusRange)) {
    const min = value.statusRange[0];
    const max = value.statusRange[1];
    if (typeof min === 'number' && typeof max === 'number') {
      match.statusRange = [min, max];
    }
  }

  return match;
};

const matchesRule = (rule: ApiToastRule, context: ApiToastContext): boolean => {
  const status = context.status ?? undefined;
  const method = normalizeMethod(context.method);

  if (
    !matchesOptional(normalizeMethod(rule.match.method), method) ||
    !matchesOptional(rule.match.endpoint, context.endpoint) ||
    !matchesOptional(rule.match.kind, context.kind) ||
    !matchesOptional(rule.match.code, context.code) ||
    !matchesOptional(rule.match.type, context.type) ||
    !matchesOptional(rule.match.status, status)
  ) {
    return false;
  }

  if (rule.match.statusRange) {
    if (status === undefined) {
      return false;
    }

    const [min, max] = rule.match.statusRange;
    if (status < min || status > max) {
      return false;
    }
  }

  return true;
};

export const parseApiToastRules = (value: unknown): ApiToastRule[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((rule): ApiToastRule[] => {
    if (!isRecord(rule) || !isRecord(rule.match) || !isRecord(rule.toast)) {
      return [];
    }

    const id = readOptionalString(rule.id);
    const title = readOptionalString(rule.toast.title);
    const category = rule.toast.category;
    if (!id || !title || !isApiToastCategory(category)) {
      return [];
    }

    const display = isApiToastDisplay(rule.display) ? rule.display : undefined;
    const message = readOptionalString(rule.toast.message);

    return [
      {
        display,
        id,
        match: readToastRuleMatch(rule.match),
        toast: {
          category,
          message,
          title,
        },
      },
    ];
  });
};

export const resolveApiToastRule = (
  context: ApiToastContext,
  rules: readonly ApiToastRule[] = createDefaultApiToastRules(),
): ApiToastRule | null => rules.find((rule) => matchesRule(rule, context)) ?? null;

export class ApiToastRuntime {
  private readonly clock: () => number;
  private readonly createId: () => string;
  private readonly eventHub?: ApiRuntimeEventHub;
  private readonly maxVisible: number;
  private readonly rateLimitMs: number;
  private readonly recentByKey = new Map<string, number>();
  private visibleToasts: ApiToast[] = [];

  constructor(options: ApiToastRuntimeOptions = {}) {
    let nextId = 0;
    this.clock = options.clock ?? (() => Date.now());
    this.createId =
      options.createId ??
      (() => {
        nextId += 1;
        return `toast-${nextId}`;
      });
    this.eventHub = options.eventHub;
    this.maxVisible = options.maxVisible ?? 3;
    this.rateLimitMs = options.rateLimitMs ?? 4000;
  }

  get visible(): readonly ApiToast[] {
    return this.visibleToasts;
  }

  dismiss(id: string): void {
    this.visibleToasts = this.visibleToasts.filter((toast) => toast.id !== id);
  }

  show(input: { category: ApiToastCategory; dedupeKey?: string; message?: string; title: string }): ApiToast | null {
    const now = this.clock();
    const dedupeKey = input.dedupeKey ?? `${input.category}:${input.title}:${input.message ?? ''}`;
    const lastShownAt = this.recentByKey.get(dedupeKey);

    if (lastShownAt !== undefined && now - lastShownAt < this.rateLimitMs) {
      return null;
    }

    this.recentByKey.set(dedupeKey, now);

    const metadata = ApiToastCategoryMetadata[input.category];
    const toast: ApiToast = {
      ...metadata,
      category: input.category,
      createdAt: now,
      id: this.createId(),
      message: input.message,
      title: input.title,
    };

    this.visibleToasts = [...this.visibleToasts, toast].slice(-this.maxVisible);
    this.eventHub?.emit({ type: 'toast', toast });

    return toast;
  }

  showForApiResult(
    context: ApiToastContext,
    rules: readonly ApiToastRule[] = createDefaultApiToastRules(),
  ): ApiToast | null {
    const rule = resolveApiToastRule(context, rules);

    if (!rule || rule.display === 'silent' || rule.display === 'modal') {
      return null;
    }

    return this.show({
      category: rule.toast.category,
      dedupeKey: rule.id,
      message: rule.toast.message,
      title: rule.toast.title,
    });
  }
}

export const apiToastRuntime = new ApiToastRuntime({
  eventHub: apiRuntimeEvents,
});
