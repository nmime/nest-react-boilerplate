// @requirements REQ-NOTIFY-LIFECYCLE-002
import { describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { AuditLogAdminService } from '@app/backend-feature-audit-log-admin';
import {
  AdminAuditLogTransactionError,
  type AdminAuditLogRepositoryPort,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
import {
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationSegmentKind,
  NotificationTargetType,
} from '@app/common-notifications';
import { AdminNotificationsController } from './admin-notifications.controller';

const principal: AuthenticatedPrincipal = {
  subject: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  roles: ['admin'],
  permissions: [],
};
const id = '00000000-0000-4000-8000-000000000003';
const channel = NotificationChannel.Bot;
const provider = NotificationDeliveryProvider.TelegramBot;
const cases: Array<[string, (controller: AdminNotificationsController) => Promise<unknown>]> = [
  [
    'createTemplate',
    (controller) =>
      controller.createTemplate(principal, {
        code: 'fixture',
        name: 'Fixture',
        channels: [{ channel, content: { body: { en: 'Fixture' } } }],
      }),
  ],
  ['updateTemplate', (controller) => controller.updateTemplate(principal, id, { name: 'Updated' })],
  ['publishTemplate', (controller) => controller.publishTemplate(principal, id)],
  ['archiveTemplate', (controller) => controller.archiveTemplate(principal, id)],
  [
    'testSend',
    (controller) =>
      controller.testSend(principal, id, {
        channel,
        provider,
        language: 'en',
        variables: {},
        targetType: NotificationTargetType.TelegramChat,
        targetId: 'fixture',
      }),
  ],
  [
    'createSegment',
    (controller) => controller.createSegment(principal, { name: 'Fixture', kind: NotificationSegmentKind.Static }),
  ],
  ['updateSegment', (controller) => controller.updateSegment(principal, id, { name: 'Updated' })],
  ['archiveSegment', (controller) => controller.archiveSegment(principal, id)],
  [
    'uploadSegmentCsv',
    (controller) => controller.uploadSegment(principal, id, { filename: 'fixture.csv', contentBase64: 'YQ==' }),
  ],
  [
    'createBroadcast',
    (controller) =>
      controller.createBroadcast(principal, {
        name: 'Fixture',
        channel,
        provider,
        templateVersionId: id,
        segmentIds: [id],
      }),
  ],
  ['updateBroadcast', (controller) => controller.updateBroadcast(principal, id, { name: 'Updated' })],
  ['command', (controller) => controller.collectAudience(principal, id, 'fixture-idempotency-key')],
];

describe('notification admin audit transaction propagation', () => {
  it.each(cases)('passes the exact audit transaction through %s', async (method, call) => {
    const transaction = {};
    const operation = vi.fn(async (...args: unknown[]) => {
      expect(args.at(-1)).toBe(transaction);
      return { id, status: 'draft' };
    });
    const recordTransactionally = vi.fn(
      async (input: Parameters<AdminAuditLogRepositoryPort['recordTransactionally']>[0]) => {
        const result = await input.operation(transaction);
        expect(input.audit(result)).toMatchObject({
          tenantId: principal.tenantId,
          actorUserId: principal.subject,
          targetUserId: id,
        });
        return result;
      },
    );
    const controller = new AdminNotificationsController(
      { [method]: operation } as unknown as ConstructorParameters<typeof AdminNotificationsController>[0],
      new AuditLogAdminService({ recordTransactionally } as unknown as AdminAuditLogRepositoryPort),
    );
    await call(controller);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(recordTransactionally).toHaveBeenCalledTimes(1);
  });

  it('reports required audit persistence failure without claiming successful mutation', async () => {
    const controller = new AdminNotificationsController(
      { createSegment: async () => ({ id }) } as unknown as ConstructorParameters<
        typeof AdminNotificationsController
      >[0],
      new AuditLogAdminService({
        recordTransactionally: async () => {
          throw new AdminAuditLogTransactionError(new Error('fixture audit failure'));
        },
      } as unknown as AdminAuditLogRepositoryPort),
    );
    await expect(
      controller.createSegment(principal, { name: 'Fixture', kind: NotificationSegmentKind.Static }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
