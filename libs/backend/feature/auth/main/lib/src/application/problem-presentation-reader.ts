import { Inject, Injectable } from '@nestjs/common';
import type { ProblemPresentationOverride } from '@app/common-problem-details';
import {
  ProblemPresentationRepositoryInjectToken,
  type ProblemPresentationRepositoryPort,
} from '@app/backend-feature-auth-shared';

export const ProblemPresentationReaderProvider = 'PROBLEM_PRESENTATION_READER';

export interface ProblemPresentationReader {
  list(tenantId: string): Promise<readonly ProblemPresentationOverride[]>;
}

@Injectable()
export class InMemoryProblemPresentationReader implements ProblemPresentationReader {
  list(): Promise<readonly ProblemPresentationOverride[]> {
    return Promise.resolve([]);
  }
}

@Injectable()
export class PostgresProblemPresentationReader implements ProblemPresentationReader {
  constructor(
    @Inject(ProblemPresentationRepositoryInjectToken)
    private readonly presentations: ProblemPresentationRepositoryPort,
  ) {}

  async list(tenantId: string): Promise<readonly ProblemPresentationOverride[]> {
    const result = await this.presentations.list(tenantId);
    if (result.isErr()) {
      throw new Error('Problem presentation configuration is unavailable.', { cause: result.error });
    }

    return result.value.map((item) => ({
      display: item.display,
      ...(item.messageEn ? { messageEn: item.messageEn } : {}),
      ...(item.messageRu ? { messageRu: item.messageRu } : {}),
      revision: item.revision,
      ruleId: item.ruleId,
      severity: item.severity,
      updatedAt: item.updatedAt.toISOString(),
    }));
  }
}

@Injectable()
export class MongoProblemPresentationReader extends PostgresProblemPresentationReader {
  constructor(@Inject(ProblemPresentationRepositoryInjectToken) presentations: ProblemPresentationRepositoryPort) {
    super(presentations);
  }
}
