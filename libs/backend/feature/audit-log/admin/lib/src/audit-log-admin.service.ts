import { Injectable } from '@nestjs/common';
import {
  AdminAuditActions,
  AdminAuditLogRepository,
  AdminAuditLogTransactionError,
  type AdminAuditLogEntity,
  type AdminAuditAction,
  type AdminAuditLogListInput,
} from '@app/backend-postgres-main-auth';
import { AdminAuditResources, AuditLogAdminDefaultPageSize, AuditLogAdminMaxPageSize } from './audit-log-admin.const';
import type { AuditLogAdminListQueryDto, AuditLogAdminViewDto } from './audit-log-admin.dto';

export class AuditLogAdminPersistenceError extends Error {
  constructor(message = 'Admin audit persistence failed.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuditLogAdminPersistenceError';
  }
}

export interface AuditLogAdminListPayload {
  items: AuditLogAdminViewDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogAdminRecordInput {
  tenantId: string;
  actorUserId?: string;
  action: AdminAuditAction;
  resource: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogAdminMutationInput<T> extends Omit<AuditLogAdminRecordInput, 'after' | 'targetId'> {
  targetId?: string | ((result: T) => string | undefined);
  after: (result: T) => Record<string, unknown>;
}

@Injectable()
export class AuditLogAdminService {
  constructor(private readonly auditLogs: AdminAuditLogRepository) {}

  async record(input: AuditLogAdminRecordInput): Promise<AuditLogAdminViewDto> {
    const result = await this.auditLogs.record(toAuditLogEntityInput(input));
    if (result.isErr()) {
      throw new AuditLogAdminPersistenceError(result.error.message);
    }
    return toAuditLogAdminView(result.value);
  }

  async recordMutation<T>(input: AuditLogAdminMutationInput<T>, operation: () => Promise<T>): Promise<T> {
    try {
      return await this.auditLogs.recordTransactionally({
        operation,
        audit: (result) => {
          const { after, targetId, ...recordInput } = input;
          return toAuditLogEntityInput({
            ...recordInput,
            targetId: typeof targetId === 'function' ? targetId(result) : targetId,
            after: after(result),
          });
        },
      });
    } catch (cause) {
      if (!(cause instanceof AdminAuditLogTransactionError)) {
        throw cause;
      }
      throw new AuditLogAdminPersistenceError('Admin audit transaction failed.', { cause });
    }
  }

  async list(tenantId: string, query: AuditLogAdminListQueryDto): Promise<AuditLogAdminListPayload> {
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const filter: AdminAuditLogListInput = {
      tenantId,
      action: query.action,
      resource: query.resource,
      actorUserId: query.actorUserId,
      targetUserId: query.targetId,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      limit,
      offset,
    };
    const [items, total] = await Promise.all([this.auditLogs.list(filter), this.auditLogs.count(filter)]);
    if (items.isErr()) {
      throw new AuditLogAdminPersistenceError(items.error.message);
    }
    if (total.isErr()) {
      throw new AuditLogAdminPersistenceError(total.error.message);
    }
    return {
      items: items.value.map(toAuditLogAdminView),
      total: total.value,
      limit,
      offset,
    };
  }

  async get(id: string, tenantId: string): Promise<AuditLogAdminViewDto | null> {
    const result = await this.auditLogs.findById(id, tenantId);
    if (result.isErr()) {
      throw new AuditLogAdminPersistenceError(result.error.message);
    }
    return result.value ? toAuditLogAdminView(result.value) : null;
  }

  metadata(): { actions: string[]; resources: string[] } {
    return { actions: [...AdminAuditActions], resources: [...AdminAuditResources] };
  }
}

const normalizeLimit = (value?: number): number =>
  Math.min(AuditLogAdminMaxPageSize, Math.max(1, value ?? AuditLogAdminDefaultPageSize));

const normalizeOffset = (value?: number): number => Math.max(0, value ?? 0);

export const toAuditLogAdminView = (entity: AdminAuditLogEntity): AuditLogAdminViewDto => ({
  id: entity.id,
  tenantId: entity.tenantId,
  ...(entity.actorUserId ? { actorUserId: entity.actorUserId } : {}),
  action: entity.action,
  resource: entity.resource,
  ...(entity.targetUserId ? { targetId: entity.targetUserId } : {}),
  before: entity.before,
  after: entity.after,
  metadata: entity.metadata,
  createdAt: entity.createdAt.toISOString(),
});

const toAuditLogEntityInput = (input: AuditLogAdminRecordInput) => ({
  tenantId: input.tenantId,
  actorUserId: input.actorUserId,
  action: input.action,
  resource: input.resource,
  targetUserId: input.targetId,
  before: input.before,
  after: input.after,
  metadata: input.metadata,
});
