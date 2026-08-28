import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';

export type StudioLanguage = 'en' | 'ru' | 'zh';
export type StudioChangeState = 'unchanged' | 'new' | 'modified' | 'deleted';

export interface LocalizedTextArrays {
  readonly en: string[];
  readonly ru: string[];
  readonly zh: string[];
}

export interface ApiResponseStudioPresentation {
  readonly display: ProblemPresentationDisplay;
  readonly severity: ProblemPresentationSeverity;
  readonly support: boolean;
  readonly customDescription: string;
  readonly figmaOnly: boolean;
  readonly comments: string;
  readonly texts: LocalizedTextArrays;
}

export type ApiResponseStudioPresentationPatch = Partial<ApiResponseStudioPresentation>;

export interface ApiResponseStudioSource {
  readonly id: string;
  readonly tenantId?: string;
  readonly name: string;
  readonly slug: string;
  readonly jsonUrl: string;
  readonly docsUrl: string;
  readonly enabled: boolean;
  readonly manualOnly: boolean;
  readonly revision: number;
  readonly lastSyncAt: string | null;
  readonly lastSyncStatus: string;
  readonly lastSyncError: string;
  readonly lastSyncSummary: Record<string, number> | null;
  readonly createdAt?: string;
  readonly updatedAt: string;
}

export interface ApiResponseStudioResponse extends ApiResponseStudioPresentation {
  readonly id: string;
  readonly sourceId: string;
  readonly stableKey: string;
  readonly tag: string;
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly status: string;
  readonly errorType: string;
  readonly description: string;
  readonly schemaSnapshot: string;
  readonly exampleSnapshot: string;
  readonly enumChoices: Array<Record<string, unknown>>;
  readonly changeState: StudioChangeState;
  readonly changeDismissed: boolean;
  readonly deleted: boolean;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ApiResponseStudioDashboardSource {
  readonly sourceId?: string;
  readonly id?: string;
  readonly name?: string;
  readonly slug?: string;
  readonly total?: number;
  readonly responses?: number;
  readonly translatedEn?: number;
  readonly translatedRu?: number;
  readonly translatedZh?: number;
  readonly coverage?: Partial<Record<StudioLanguage, number>>;
}

export interface ApiResponseStudioDashboard {
  readonly sources: ApiResponseStudioDashboardSource[];
  readonly totals: Record<string, number>;
}

export interface ApiResponseStudioHistoryEntry {
  readonly id: string;
  readonly sourceId: string | null;
  readonly responseId: string | null;
  readonly action: string;
  readonly actorUserId: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface ApiResponseStudioHistoryQuery {
  readonly sourceId?: string;
  readonly responseId?: string;
  readonly action?: string;
  readonly actorUserId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ApiResponseStudioExport {
  readonly filename: string;
  readonly mediaType: string;
  readonly content: string;
}

export interface RevisionItem {
  readonly id: string;
  readonly expectedRevision: number;
}

export interface CreateApiResponseStudioSource {
  readonly name: string;
  readonly slug: string;
  readonly jsonUrl: string;
  readonly docsUrl?: string;
  readonly enabled: boolean;
}

export type UpdateApiResponseStudioSource = CreateApiResponseStudioSource;

export interface ApiResponseStudioResponseQuery {
  readonly sourceId?: string;
  readonly search?: string;
  readonly exact?: string;
  readonly status?: string;
  readonly method?: string;
  readonly display?: ProblemPresentationDisplay;
  readonly changeState?: StudioChangeState;
  readonly missingLanguage?: StudioLanguage;
  readonly includeDeleted?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export const emptyPresentation: ApiResponseStudioPresentation = {
  comments: '',
  customDescription: '',
  display: 'toast',
  figmaOnly: false,
  severity: 'error',
  support: false,
  texts: { en: [], ru: [], zh: [] },
};

export const toRevisionItem = (response: ApiResponseStudioResponse): RevisionItem => ({
  expectedRevision: response.revision,
  id: response.id,
});
