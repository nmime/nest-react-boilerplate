import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";

export type TransactionalOutboxEventStatus = "pending" | "published" | "failed";

export interface TransactionalOutboxEventEntityInput {
  tenantId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status?: TransactionalOutboxEventStatus;
  createdAt?: Date;
  publishedAt?: Date | null;
}

export class TransactionalOutboxEventEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  aggregateType!: string;
  aggregateId!: string;
  eventType!: string;
  payload: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
  status: TransactionalOutboxEventStatus = "pending";
  createdAt: Date = new Date();
  publishedAt: Date | null = null;

  constructor(input?: TransactionalOutboxEventEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.aggregateType = input.aggregateType;
      this.aggregateId = input.aggregateId;
      this.eventType = input.eventType;
      this.payload = input.payload ?? {};
      this.metadata = input.metadata ?? {};
      this.status = input.status ?? "pending";
      this.createdAt = input.createdAt ?? new Date();
      this.publishedAt = input.publishedAt ?? null;
    }
  }
}

export const TransactionalOutboxEventEntitySchema =
  new EntitySchema<TransactionalOutboxEventEntity>({
    class: TransactionalOutboxEventEntity,
    tableName: "transactional_outbox_events",
    properties: {
      id: { type: "uuid", primary: true },
      tenantId: {
        type: "uuid",
        fieldName: "tenant_id",
        default: DefaultAuthTenantId,
      },
      aggregateType: {
        type: "varchar",
        fieldName: "aggregate_type",
        length: 128,
      },
      aggregateId: {
        type: "uuid",
        fieldName: "aggregate_id",
      },
      eventType: {
        type: "varchar",
        fieldName: "event_type",
        length: 128,
      },
      payload: { type: "json", defaultRaw: "'{}'::jsonb" },
      metadata: { type: "json", defaultRaw: "'{}'::jsonb" },
      status: { type: "varchar", length: 32, default: "pending" },
      createdAt: {
        type: "timestamptz",
        fieldName: "created_at",
        onCreate: () => new Date(),
      },
      publishedAt: {
        type: "timestamptz",
        fieldName: "published_at",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "ix__transactional_outbox_events__tenant_id_status_created_at",
        properties: ["tenantId", "status", "createdAt"],
      },
      {
        name: "ix__transactional_outbox_events__tenant_id_aggregate_type_aggregate_id",
        properties: ["tenantId", "aggregateType", "aggregateId"],
      },
    ],
  });
