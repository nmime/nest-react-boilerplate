// @requirements REQ-AUTH-TENANT-004
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AdminProblemPresentationsController } from './admin-problem-presentations.controller';

const tenantId = '00000000-0000-4000-8000-000000000001';
const actorUserId = '00000000-0000-4000-8000-000000000002';
const ruleId = 'user-app-api:PATCH:/profile:409:resource-conflict';
const principal: AuthenticatedPrincipal = {
  subject: actorUserId,
  tenantId,
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: ['admin:settings:read', 'admin:settings:update'],
};
const request = {
  headers: {
    'x-request-id': 'request-1',
    'user-agent': 'Vitest',
  },
  ip: '127.0.0.1',
} as AuthenticatedRequest;

const presentation = {
  ruleId,
  display: 'silent' as const,
  severity: 'info' as const,
  comment: 'Handled inline',
  messageEn: 'Conflict',
  messageRu: 'Conflict',
  revision: 3,
  updatedAt: '2026-07-19T13:00:00.000Z',
};

const createController = () => {
  const presentations = {
    list: vi.fn(() => Promise.resolve({ items: [presentation] })),
    update: vi.fn(() => Promise.resolve(presentation)),
    reset: vi.fn(() => Promise.resolve({ ruleId })),
  };

  return {
    controller: new AdminProblemPresentationsController(presentations as never),
    presentations,
  };
};

describe('AdminProblemPresentationsController', () => {
  it('lists tenant presentation overrides in an OK envelope', async () => {
    const { controller, presentations } = createController();

    await expect(controller.list(principal)).resolves.toEqual({ data: { items: [presentation] } });
    expect(presentations.list).toHaveBeenCalledWith(principal);
  });

  it('updates a presentation with request audit context', async () => {
    const { controller, presentations } = createController();
    const input = {
      comment: 'Handled inline',
      display: 'silent' as const,
      expectedRevision: 2,
      messageEn: 'Conflict',
      messageRu: 'Conflict',
      ruleId,
      severity: 'info' as const,
    };

    await expect(controller.update(principal, input, request)).resolves.toEqual({ data: presentation });
    expect(presentations.update).toHaveBeenCalledWith(principal, input, {
      requestId: 'request-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest',
    });
  });

  it('resets a presentation with request audit context', async () => {
    const { controller, presentations } = createController();
    const input = { expectedRevision: 3, ruleId };

    await expect(controller.reset(principal, input, request)).resolves.toEqual({ data: { ruleId } });
    expect(presentations.reset).toHaveBeenCalledWith(principal, input, {
      requestId: 'request-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest',
    });
  });
});
