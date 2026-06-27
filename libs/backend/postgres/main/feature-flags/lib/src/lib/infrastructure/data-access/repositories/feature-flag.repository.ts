import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import {
  DefaultFeatureFlagTenantId,
  type FeatureFlagContext,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
} from "@app/common/feature-flags";
import { ResultAsync } from "neverthrow";
import { FeatureFlagEntity } from "../entities";

export interface FeatureFlagRepositoryError {
  code: "repository_error";
  message: string;
}

export interface FeatureFlagUpsertInput {
  tenantId?: string;
  key: string;
  value: FeatureFlagValue;
  description?: string | null;
  enabled?: boolean;
}

@Injectable()
export class FeatureFlagRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  findByKey(
    key: string,
    tenantId: string = DefaultFeatureFlagTenantId,
  ): ResultAsync<FeatureFlagEntity | null, FeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(FeatureFlagEntity, { key, tenantId }),
      mapRepositoryError,
    );
  }

  listEnabled(
    context: FeatureFlagContext = {},
  ): ResultAsync<FeatureFlagEntity[], FeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(
        FeatureFlagEntity,
        { enabled: true, tenantId: resolveTenantId(context) },
        { orderBy: { key: "ASC" } },
      ),
      mapRepositoryError,
    );
  }

  getSnapshot(
    context: FeatureFlagContext = {},
  ): ResultAsync<FeatureFlagSnapshot, FeatureFlagRepositoryError> {
    return this.listEnabled(context).map((flags) => ({
      source: "postgres",
      values: Object.fromEntries(flags.map((flag) => [flag.key, flag.value])),
    }));
  }

  upsert(
    input: FeatureFlagUpsertInput,
  ): ResultAsync<FeatureFlagEntity, FeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(this.persistFlag(input), mapRepositoryError);
  }

  private async persistFlag(
    input: FeatureFlagUpsertInput,
  ): Promise<FeatureFlagEntity> {
    const tenantId = input.tenantId ?? DefaultFeatureFlagTenantId;
    const existing = await this.entityManager.findOne(FeatureFlagEntity, {
      key: input.key,
      tenantId,
    });

    if (existing) {
      existing.value = input.value;
      existing.description = input.description ?? existing.description;
      existing.enabled = input.enabled ?? existing.enabled;
      await this.entityManager.flush();
      return existing;
    }

    const entity = new FeatureFlagEntity({ ...input, tenantId });
    this.entityManager.persist(entity);
    await this.entityManager.flush();

    return entity;
  }
}

export function resolveTenantId(context: FeatureFlagContext = {}): string {
  return context.tenantId ?? DefaultFeatureFlagTenantId;
}

function mapRepositoryError(cause: unknown): FeatureFlagRepositoryError {
  return {
    code: "repository_error",
    message:
      cause instanceof Error
        ? cause.message
        : "Feature flag repository failed.",
  };
}
