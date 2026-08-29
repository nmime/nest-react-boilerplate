// @requirements REQ-API-RESPONSE-STUDIO-002 REQ-API-RESPONSE-STUDIO-004
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  RequiredPermissionsMetadataKey,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import { AdminSettingsReadPermission, AdminSettingsUpdatePermission } from '@app/backend-feature-admin-shared';
import { AdminApiResponseStudioController } from './admin-api-response-studio.controller';

const tenantId = '00000000-0000-4000-8000-000000000001';
const actorUserId = '00000000-0000-4000-8000-000000000002';
const principal: AuthenticatedPrincipal = {
  subject: actorUserId,
  tenantId,
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: [AdminSettingsReadPermission, AdminSettingsUpdatePermission],
};
const request = {
  headers: {
    'x-request-id': 'request-1',
    'user-agent': 'Vitest',
  },
  ip: '203.0.113.9',
} as AuthenticatedRequest;

const exportPayload = {
  filename: 'api-response-presentations.json',
  mediaType: 'application/json; charset=utf-8',
  content: '[\n]\n',
};

const createController = () => {
  const studio = {
    dashboard: vi.fn(() => okAsync({ sources: [], totals: { sources: 0 } })),
    listSources: vi.fn(() => okAsync([])),
    createSource: vi.fn((input) => okAsync(input)),
    updateSource: vi.fn((input) => okAsync(input)),
    sync: vi.fn((input) => okAsync({ source: input, summary: { created: 0, modified: 0, deleted: 0, unchanged: 0 } })),
    listResponses: vi.fn(() => okAsync([{ id: 'row-1' }])),
    countResponses: vi.fn(() => okAsync(1)),
    updateResponse: vi.fn((input) => okAsync(input)),
    resetResponse: vi.fn((input) => okAsync(input)),
    bulkUpdate: vi.fn((input) => okAsync(input.items)),
    dismissChanges: vi.fn((input) => okAsync(input.items)),
    export: vi.fn(() => okAsync(exportPayload)),
    history: vi.fn(() => okAsync([{ id: 'history-1' }])),
  };
  return { controller: new AdminApiResponseStudioController(studio as never), studio };
};

const metadata = (method: keyof AdminApiResponseStudioController) =>
  Reflect.getMetadata(RequiredPermissionsMetadataKey, AdminApiResponseStudioController.prototype[method]);

describe('AdminApiResponseStudioController', () => {
  it('declares read RBAC for reads/export/history and update RBAC for every mutation', () => {
    for (const method of ['dashboard', 'sources', 'responses', 'export', 'history'] as const) {
      expect(metadata(method)).toEqual([AdminSettingsReadPermission]);
    }
    for (const method of [
      'createSource',
      'updateSource',
      'sync',
      'updateResponse',
      'resetResponse',
      'bulk',
      'dismiss',
    ] as const) {
      expect(metadata(method)).toEqual([AdminSettingsUpdatePermission]);
    }
  });

  it('passes tenant, actor, manual-only, route identifiers, and bounded audit context to mutations', async () => {
    const { controller, studio } = createController();

    await controller.createSource(
      principal,
      { name: 'API', slug: 'api', jsonUrl: 'https://api.example.com/openapi.json' },
      request,
    );
    expect(studio.createSource).toHaveBeenCalledWith({
      name: 'API',
      slug: 'api',
      jsonUrl: 'https://api.example.com/openapi.json',
      tenantId,
      actorUserId,
      manualOnly: true,
      metadata: { requestId: 'request-1', ipAddress: '203.0.113.9', userAgent: 'Vitest' },
    });

    await controller.updateSource(principal, 'source-1', { expectedRevision: 2, enabled: false }, request);
    expect(studio.updateSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-1',
        tenantId,
        actorUserId,
        expectedRevision: 2,
      }),
    );

    await controller.sync(principal, 'source-1', { expectedRevision: 3 }, request);
    expect(studio.sync).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        tenantId,
        actorUserId,
        expectedRevision: 3,
      }),
    );
  });

  it('loads response rows and count concurrently into a tenant-scoped envelope', async () => {
    const { controller, studio } = createController();
    const query = { method: 'GET', limit: 25, offset: 0 };

    await expect(controller.responses(principal, query)).resolves.toEqual({
      data: { items: [{ id: 'row-1' }], total: 1 },
    });
    expect(studio.listResponses).toHaveBeenCalledWith(tenantId, query);
    expect(studio.countResponses).toHaveBeenCalledWith(tenantId, query);
  });

  it('separates expected revision from presentation and adds identity/audit metadata to row, bulk, reset, and dismiss mutations', async () => {
    const { controller, studio } = createController();
    const presentation = {
      expectedRevision: 4,
      display: 'modal' as const,
      severity: 'warning' as const,
      support: true,
      customDescription: '',
      figmaOnly: false,
      comments: 'reviewed',
      texts: { en: ['Hello'], ru: ['Привет'], zh: ['你好'] },
    };

    await controller.updateResponse(principal, 'row-1', presentation, request);
    expect(studio.updateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-1',
        expectedRevision: 4,
        tenantId,
        actorUserId,
        presentation: expect.objectContaining({ display: 'modal', texts: presentation.texts }),
      }),
    );
    expect(studio.updateResponse.mock.calls[0]?.[0].presentation).not.toHaveProperty('expectedRevision');

    await controller.resetResponse(principal, 'row-1', { expectedRevision: 5 }, request);
    expect(studio.resetResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'row-1', expectedRevision: 5, tenantId, actorUserId }),
    );

    const items = [{ id: '00000000-0000-4000-8000-000000000010', expectedRevision: 6 }];
    await controller.bulk(principal, { items, patch: presentation }, request);
    expect(studio.bulkUpdate).toHaveBeenCalledWith(expect.objectContaining({ items, tenantId, actorUserId }));

    await controller.dismiss(principal, { items }, request);
    expect(studio.dismissChanges).toHaveBeenCalledWith(expect.objectContaining({ items, tenantId, actorUserId }));
  });

  it('returns deterministic export and tenant-scoped history envelopes without altering payload content', async () => {
    const { controller, studio } = createController();
    const exportQuery = { sourceId: '00000000-0000-4000-8000-000000000010', includeDeleted: false };

    await expect(controller.export(principal, exportQuery)).resolves.toEqual({ data: exportPayload });
    expect(studio.export).toHaveBeenCalledWith(tenantId, exportQuery);

    const historyQuery = { action: 'response.updated', limit: 10 };
    await expect(controller.history(principal, historyQuery)).resolves.toEqual({
      data: { items: [{ id: 'history-1' }] },
    });
    expect(studio.history).toHaveBeenCalledWith(tenantId, historyQuery);
  });

  it.each([
    ['revision_conflict', ConflictException],
    ['not_found', NotFoundException],
    ['validation_error', BadRequestException],
    ['repository_error', InternalServerErrorException],
  ] as const)('maps %s repository errors to RFC-compatible Nest HTTP exceptions', async (code, exception) => {
    const { controller, studio } = createController();
    studio.dashboard.mockReturnValue(errAsync({ code, message: `${code} message` }) as never);

    await expect(controller.dashboard(principal)).rejects.toBeInstanceOf(exception);
    await expect(controller.dashboard(principal)).rejects.toThrow(`${code} message`);
  });
});
