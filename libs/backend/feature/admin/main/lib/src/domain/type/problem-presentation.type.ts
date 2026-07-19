import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';

export interface AdminProblemPresentationView {
  readonly comment: string;
  readonly display: ProblemPresentationDisplay;
  readonly messageEn: string;
  readonly messageRu: string;
  readonly revision: number;
  readonly ruleId: string;
  readonly severity: ProblemPresentationSeverity;
  readonly updatedAt?: string;
}

export interface AdminProblemPresentationCatalog {
  readonly items: readonly AdminProblemPresentationView[];
}

export interface UpdateAdminProblemPresentationCommand {
  readonly comment?: string;
  readonly display: ProblemPresentationDisplay;
  readonly expectedRevision: number;
  readonly messageEn?: string;
  readonly messageRu?: string;
  readonly ruleId: string;
  readonly severity: ProblemPresentationSeverity;
}

export interface ResetAdminProblemPresentationCommand {
  readonly expectedRevision: number;
  readonly ruleId: string;
}

export interface ResetAdminProblemPresentationResult {
  readonly ruleId: string;
}
