import type { ApiRuntimeEventHub } from "./runtime-events";

export type ApiToastCategory = "error" | "info" | "success" | "warning";
export type ApiToastDisplay = "custom" | "modal" | "silent" | "toast";

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

export interface ApiToastContext {
  code?: string;
  endpoint?: string;
  kind?: string;
  method?: string;
  status?: number | null;
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

export const API_TOAST_CATEGORY_METADATA: Record<
  ApiToastCategory,
  ApiToastMetadata
> = {
  error: { color: "danger", icon: "circle-alert" },
  info: { color: "info", icon: "circle-info" },
  success: { color: "success", icon: "circle-check" },
  warning: { color: "warning", icon: "triangle-alert" },
};

export const defaultApiToastRules: ApiToastRule[] = [
  {
    display: "toast",
    id: "api.network.offline",
    match: { kind: "network" },
    toast: {
      category: "warning",
      title: "Connection lost",
      message: "Check your internet connection and try again.",
    },
  },
  {
    display: "toast",
    id: "api.server.error",
    match: { statusRange: [500, 599] },
    toast: {
      category: "error",
      title: "Service is temporarily unavailable",
      message: "Please try again in a moment.",
    },
  },
  {
    display: "silent",
    id: "api.auth.unauthorized",
    match: { status: 401 },
    toast: { category: "info", title: "Authentication required" },
  },
];

const normalizeMethod = (method?: string): string | undefined =>
  method?.toUpperCase();

const matchesRule = (rule: ApiToastRule, context: ApiToastContext): boolean => {
  const status = context.status ?? undefined;
  const method = normalizeMethod(context.method);

  if (rule.match.method && normalizeMethod(rule.match.method) !== method) {
    return false;
  }

  if (rule.match.endpoint && rule.match.endpoint !== context.endpoint) {
    return false;
  }

  if (rule.match.kind && rule.match.kind !== context.kind) {
    return false;
  }

  if (rule.match.code && rule.match.code !== context.code) {
    return false;
  }

  if (rule.match.status !== undefined && rule.match.status !== status) {
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

  return value.filter((rule): rule is ApiToastRule => {
    if (typeof rule !== "object" || rule === null) {
      return false;
    }

    const candidate = rule as Partial<ApiToastRule>;
    return Boolean(
      candidate.id &&
      candidate.match &&
      candidate.toast?.category &&
      candidate.toast.title,
    );
  });
};

export const resolveApiToastRule = (
  context: ApiToastContext,
  rules: readonly ApiToastRule[] = defaultApiToastRules,
): ApiToastRule | null =>
  rules.find((rule) => matchesRule(rule, context)) ?? null;

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

  show(input: {
    category: ApiToastCategory;
    dedupeKey?: string;
    message?: string;
    title: string;
  }): ApiToast | null {
    const now = this.clock();
    const dedupeKey =
      input.dedupeKey ??
      `${input.category}:${input.title}:${input.message ?? ""}`;
    const lastShownAt = this.recentByKey.get(dedupeKey);

    if (lastShownAt !== undefined && now - lastShownAt < this.rateLimitMs) {
      return null;
    }

    this.recentByKey.set(dedupeKey, now);

    const metadata = API_TOAST_CATEGORY_METADATA[input.category];
    const toast: ApiToast = {
      ...metadata,
      category: input.category,
      createdAt: now,
      id: this.createId(),
      message: input.message,
      title: input.title,
    };

    this.visibleToasts = [...this.visibleToasts, toast].slice(-this.maxVisible);
    this.eventHub?.emit({ type: "toast", toast });

    return toast;
  }

  showForApiResult(
    context: ApiToastContext,
    rules: readonly ApiToastRule[] = defaultApiToastRules,
  ): ApiToast | null {
    const rule = resolveApiToastRule(context, rules);

    if (!rule || rule.display === "silent" || rule.display === "modal") {
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

export const apiToastRuntime = new ApiToastRuntime();
