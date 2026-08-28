import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';
import { DefaultAuthTenantId } from './auth-user.entity';

export interface ProblemPresentationEntityInput {
  tenantId?: string;
  ruleId: string;
  display: ProblemPresentationDisplay;
  severity: ProblemPresentationSeverity;
  comment?: string;
  messageEn?: string;
  messageRu?: string;
  messageZh?: string;
  textsEn?: string[];
  textsRu?: string[];
  textsZh?: string[];
  support?: boolean;
  customDescription?: string;
  figmaOnly?: boolean;
  revision?: number;
  updatedByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProblemPresentationEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  ruleId!: string;
  display!: ProblemPresentationDisplay;
  severity!: ProblemPresentationSeverity;
  comment = '';
  messageEn = '';
  messageRu = '';
  messageZh = '';
  textsEn: string[] = [];
  textsRu: string[] = [];
  textsZh: string[] = [];
  support = false;
  customDescription = '';
  figmaOnly = false;
  revision = 1;
  updatedByUserId!: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: ProblemPresentationEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.ruleId = input.ruleId;
      this.display = input.display;
      this.severity = input.severity;
      this.comment = input.comment ?? '';
      this.messageEn = input.messageEn ?? '';
      this.messageRu = input.messageRu ?? '';
      this.messageZh = input.messageZh ?? '';
      this.textsEn = input.textsEn ?? (this.messageEn ? [this.messageEn] : []);
      this.textsRu = input.textsRu ?? (this.messageRu ? [this.messageRu] : []);
      this.textsZh = input.textsZh ?? (this.messageZh ? [this.messageZh] : []);
      this.support = input.support ?? false;
      this.customDescription = input.customDescription ?? '';
      this.figmaOnly = input.figmaOnly ?? false;
      this.revision = input.revision ?? 1;
      this.updatedByUserId = input.updatedByUserId;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

const sqlStringList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

export const ProblemPresentationEntitySchema = new EntitySchema<ProblemPresentationEntity>({
  class: ProblemPresentationEntity,
  tableName: 'problem_presentation_overrides',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    ruleId: { type: 'varchar', length: 512, fieldName: 'rule_id' },
    display: { type: 'varchar', length: 16 },
    severity: { type: 'varchar', length: 16 },
    comment: { type: 'text', default: '' },
    messageEn: { type: 'text', fieldName: 'message_en', default: '' },
    messageRu: { type: 'text', fieldName: 'message_ru', default: '' },
    messageZh: { type: 'text', fieldName: 'message_zh', default: '' },
    textsEn: { type: 'json', fieldName: 'texts_en', defaultRaw: "'[]'::jsonb" },
    textsRu: { type: 'json', fieldName: 'texts_ru', defaultRaw: "'[]'::jsonb" },
    textsZh: { type: 'json', fieldName: 'texts_zh', defaultRaw: "'[]'::jsonb" },
    support: { type: 'boolean', default: false },
    customDescription: { type: 'text', fieldName: 'custom_description', default: '' },
    figmaOnly: { type: 'boolean', fieldName: 'figma_only', default: false },
    revision: { type: 'integer', default: 1 },
    updatedByUserId: { type: 'uuid', fieldName: 'updated_by_user_id' },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [{ name: 'ix__problem_presentation_overrides__tenant_id', properties: ['tenantId'] }],
  uniques: [
    {
      name: 'uq__problem_presentation_overrides__tenant_id_rule_id',
      properties: ['tenantId', 'ruleId'],
    },
  ],
  checks: [
    {
      name: 'ck__problem_presentation_overrides__rule_id',
      expression:
        '"rule_id" ~ \'^(admin|auth|user)-app-api:(GET|PUT|POST|DELETE|PATCH|OPTIONS|HEAD|TRACE):/[^[:space:]]+:(default|ERR|NET|[1-5][0-9]{2})(:[A-Za-z0-9][A-Za-z0-9._-]*)?$\'',
    },
    {
      name: 'ck__problem_presentation_overrides__display',
      expression: `"display" in (${sqlStringList(ProblemPresentationDisplays)})`,
    },
    {
      name: 'ck__problem_presentation_overrides__severity',
      expression: `"severity" in (${sqlStringList(ProblemPresentationSeverities)})`,
    },
    {
      name: 'ck__problem_presentation_overrides__revision',
      expression: '"revision" >= 1',
    },
  ],
});
