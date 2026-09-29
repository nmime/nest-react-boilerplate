import { parseApiToastRules, type ApiToastRule } from '@app/frontend-api-support';

export interface GeneratedToastConfig {
  readonly source: { readonly app: string };
  readonly defaults: {
    readonly toast: { readonly category: string; readonly titleKey: string; readonly messageSource: string };
  };
  readonly rules: readonly {
    readonly id: string;
    readonly display: string;
    readonly match: {
      readonly method: string;
      readonly endpoint: string;
      readonly status?: number;
      readonly code?: string;
    };
    readonly toast: { readonly category?: string; readonly titleKey?: string };
    readonly catalog: {
      readonly operationId: string | null;
      readonly tags: readonly string[];
      readonly defaultMessage: string;
      readonly status?: string;
    };
  }[];
}

// Keep the public parser fail-closed. Only this owned, generated format carries
// defaults; they are expanded before the existing runtime validation runs.
export const parseGeneratedToastRules = (config: GeneratedToastConfig): ApiToastRule[] =>
  parseApiToastRules(config.rules.map((rule) => ({ ...rule, toast: { ...config.defaults.toast, ...rule.toast } })));
