import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { ProblemPresentationsController } from './problem-presentations.controller';

describe('ProblemPresentationsController', () => {
  it('returns only the authenticated tenant runtime overrides', async () => {
    const reader = {
      list: vi.fn(() =>
        Promise.resolve([
          {
            ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
            display: 'silent',
            revision: 2,
            severity: 'info',
          } as const,
        ]),
      ),
    };
    const controller = new ProblemPresentationsController(reader);
    const principal = {
      subject: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      roles: ['user'],
      permissions: [],
    } satisfies AuthenticatedPrincipal;

    await expect(controller.list(principal)).resolves.toEqual({
      data: {
        items: [
          {
            ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
            display: 'silent',
            revision: 2,
            severity: 'info',
          },
        ],
      },
    });
    expect(reader.list).toHaveBeenCalledWith('tenant-1');
  });
});
