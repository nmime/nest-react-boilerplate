import { Inject, Injectable } from '@nestjs/common';
import type { ProblemPresentationOverride } from '@app/common-problem-details';
import {
  ApiResponseStudioRepositoryInjectToken,
  ProblemPresentationRepositoryInjectToken,
  type ApiResponseStudioRepositoryPort,
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
    @Inject(ApiResponseStudioRepositoryInjectToken)
    private readonly studio: ApiResponseStudioRepositoryPort,
  ) {}

  async list(tenantId: string): Promise<readonly ProblemPresentationOverride[]> {
    const [legacy, studio] = await Promise.all([
      this.presentations.list(tenantId),
      this.studio.listResponses(tenantId, { includeDeleted: false, limit: 500, offset: 0 }),
    ]);
    if (legacy.isErr()) {
      throw new Error('Problem presentation configuration is unavailable.', { cause: legacy.error });
    }
    if (studio.isErr()) {
      throw new Error('API Response Studio configuration is unavailable.', { cause: studio.error });
    }

    const merged = new Map<string, ProblemPresentationOverride>(
      legacy.value.map((item) => [
        item.ruleId,
        {
          display: item.display,
          ...(item.messageEn ? { messageEn: item.messageEn } : {}),
          ...(item.messageRu ? { messageRu: item.messageRu } : {}),
          ...(item.messageZh ? { messageZh: item.messageZh } : {}),
          ...(item.textsEn || item.textsRu || item.textsZh
            ? { texts: { en: item.textsEn, ru: item.textsRu, zh: item.textsZh } }
            : {}),
          customDescription: item.customDescription,
          figmaOnly: item.figmaOnly,
          support: item.support,
          revision: item.revision,
          ruleId: item.ruleId,
          severity: item.severity,
          updatedAt: item.updatedAt.toISOString(),
          updatedByUserId: item.updatedByUserId,
        },
      ]),
    );
    for (const item of studio.value) {
      merged.set(item.stableKey, {
        display: item.display,
        messageEn: item.texts.en[0],
        messageRu: item.texts.ru[0],
        messageZh: item.texts.zh[0],
        texts: item.texts,
        customDescription: item.customDescription,
        figmaOnly: item.figmaOnly,
        support: item.support,
        revision: item.revision,
        ruleId: item.stableKey,
        severity: item.severity,
        updatedAt: item.updatedAt.toISOString(),
        updatedByUserId: item.updatedByUserId,
      });
    }
    return [...merged.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  }
}

@Injectable()
export class MongoProblemPresentationReader extends PostgresProblemPresentationReader {}
