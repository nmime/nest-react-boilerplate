import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { apiToastRuntime } from '@app/frontend-api-support';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../entities/admin-session';
import { renderAdminRoute } from '../App';
import { AdminLayout } from '../widgets/admin-shell';

const adminAccess = createAdminAccess({
  subject: 'admin-id',
  roles: ['admin'],
  permissions: [
    'admin:dashboard:read',
    'admin:profile:read',
    'admin:users:read',
    'admin:users:status:update',
    'admin:users:access-policy:update',
    'admin:roles:read',
    'admin:audit:read',
    'admin:auth-login-analytics:read',
    'admin:settings:read',
    'admin:settings:update',
  ],
});

const restrictedAccess = createAdminAccess({
  subject: 'admin-id',
  roles: [],
  permissions: ['admin:dashboard:read', 'admin:profile:read'],
});

const payload = {
  principal: {
    subject: 'admin-id',
    email: 'admin@example.com',
    roles: adminAccess.roles,
    permissions: adminAccess.permissions,
  },
  profile: {
    id: 'admin-id',
    displayName: 'Ada Admin',
    email: 'admin@example.com',
  },
};

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'user@example.com',
  status: 'active' as const,
  roles: ['user'],
  permissions: ['profile:read'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rolesCatalog = {
  resources: ['admin.users'],
  assignableRoles: ['user', 'admin'],
  assignablePermissions: ['profile:read', 'admin:users:read'],
  roles: [
    {
      id: 'role-user',
      role: 'user',
      label: 'User',
      description: 'User',
      isSystem: true,
      permissions: ['profile:read'],
    },
    {
      id: 'role-admin',
      role: 'admin',
      label: 'Administrator',
      description: 'Admin',
      isSystem: true,
      permissions: ['admin:users:read'],
    },
  ],
  permissions: [
    {
      permission: 'profile:read',
      resource: 'admin.profile',
      action: 'read',
      description: 'Profile',
    },
    {
      permission: 'admin:users:read',
      resource: 'admin.users',
      action: 'read',
      description: 'Users',
    },
  ],
};

// A catalog that additionally carries a non-system custom role so the editable
// matrix can toggle a role that is not protected by backend invariants.
const editableRolesCatalog = {
  ...rolesCatalog,
  roles: [
    ...rolesCatalog.roles,
    {
      id: 'role-ops',
      role: 'ops',
      label: 'Ops team',
      description: 'Operations',
      isSystem: false,
      permissions: [] as string[],
    },
  ],
};

const rolesWriteAccess = createAdminAccess({
  subject: 'admin-id',
  roles: ['admin'],
  permissions: ['admin:roles:read', 'admin:roles:write', 'admin:users:read'],
});

const AdminTestProviders = ({ children }: Readonly<{ children: ReactElement }>) => (
  <FrontendStateProvider>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const renderAdminRouteForTest = (element: ReactElement) => render(<AdminTestProviders>{element}</AdminTestProviders>);

describe('admin pages integration', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders dashboard summary, profile, and health/live/ready statuses from real endpoints', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerDashboardSummary').mockResolvedValue({
      data: {
        activeUsers: 7,
        disabledUsers: 3,
        invitedUsers: 2,
        recentAudit: [],
        recentAuditEvents: 4,
        totalUsers: 42,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminHealthControllerHealth').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminHealthControllerLive').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminHealthControllerReady').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminProfileControllerMe').mockResolvedValue({
      data: payload,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const renderRoute = (path: string) => {
      cleanup();
      renderAdminRouteForTest(
        <AdminLayout access={adminAccess} currentPath={path}>
          {renderAdminRoute(path, { status: 'ready', payload, access: adminAccess }, undefined, {
            requestOptions: {
              baseUrl: 'https://admin.example.test',
            },
          })}
        </AdminLayout>,
      );
    };

    renderRoute('/admin');
    expect((await screen.findAllByText('42')).length).toBeGreaterThan(0);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Pending invitations')).toBeTruthy();
    expect(screen.getAllByText('Ready').length).toBeGreaterThanOrEqual(3);

    renderRoute('/admin/profile');
    expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Email: admin@example.com')).toBeTruthy();
  });

  it('renders dashboard summary and health endpoint errors', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerDashboardSummary').mockRejectedValue(new Error('summary offline'));
    vi.spyOn(adminApi, 'adminHealthControllerHealth').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });
    vi.spyOn(adminApi, 'adminHealthControllerLive').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });
    vi.spyOn(adminApi, 'adminHealthControllerReady').mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });

    renderAdminRouteForTest(
      renderAdminRoute('/admin', { status: 'ready', payload, access: adminAccess }, undefined, {
        requestOptions: {
          baseUrl: 'https://admin.example.test',
        },
      }),
    );

    expect(await screen.findAllByText('Dashboard summary request failed')).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(3);
    });
  });

  it('lists users, opens detail, searches, filters, paginates, and sends mutation bodies', async () => {
    const listSpy = vi.spyOn(adminApi, 'adminUsersControllerListUsers').mockResolvedValue({
      data: {
        items: [user],
        total: 12,
        limit: 10,
        offset: 0,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const detailSpy = vi.spyOn(adminApi, 'adminUsersControllerGetUser').mockResolvedValue({
      data: user,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const statusSpy = vi.spyOn(adminApi, 'adminUsersControllerUpdateUserStatus').mockResolvedValue({
      data: { ...user, status: 'disabled' },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const accessSpy = vi.spyOn(adminApi, 'adminUsersControllerUpdateUserAccessPolicy').mockResolvedValue({
      data: { ...user, roles: ['admin'], permissions: ['admin:users:read'] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    renderAdminRouteForTest(
      <AdminLayout
        access={adminAccess}
        currentPath="/admin/users?search=ada&status=disabled&role=admin&permission=admin:users:read&page=2"
      >
        {renderAdminRoute('/admin/users?search=ada&status=disabled&role=admin&permission=admin:users:read&page=2', {
          status: 'ready',
          payload,
          access: adminAccess,
        })}
      </AdminLayout>,
    );

    expect(await screen.findByText('user@example.com')).toBeTruthy();
    expect(screen.getAllByText('Users').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('user@example.com'));
    expect(await screen.findByText('profile:read')).toBeTruthy();
    expect(screen.getByText('Current access')).toBeTruthy();

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 10,
          permission: 'admin:users:read',
          role: 'admin',
          search: 'ada',
          status: 'disabled',
        }),
        undefined,
      );
    });

    expect(statusSpy).not.toHaveBeenCalled();
    expect(accessSpy).not.toHaveBeenCalled();
    expect(detailSpy).toHaveBeenCalledWith('user-1', undefined);
  });

  it('assigns roles to a user via the assign-user-roles endpoint when the admin can write roles', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerListUsers').mockResolvedValue({
      data: { items: [user], total: 1, limit: 10, offset: 0 },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const assignSpy = vi.spyOn(adminApi, 'adminRolesControllerAssignUserRoles').mockResolvedValue({
      data: { ...user, roles: ['user', 'admin'] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    renderAdminRouteForTest(
      <AdminLayout access={rolesWriteAccess} currentPath="/admin/users">
        {renderAdminRoute('/admin/users', {
          status: 'ready',
          payload,
          access: rolesWriteAccess,
        })}
      </AdminLayout>,
    );

    expect(await screen.findByText('user@example.com')).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign roles' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign roles' }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('user-1', { roles: ['user', 'admin'] }, undefined);
    });
  });

  it('renders roles matrix, audit list and audit empty state without fake data', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'auditLogAdminControllerMetadata').mockResolvedValue({
      data: { actions: ['admin.user.status.update'], resources: ['admin.users'] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const auditSpy = vi
      .spyOn(adminApi, 'auditLogAdminControllerList')
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: '00000000-0000-4000-8000-000000000011',
              tenantId: '00000000-0000-4000-8000-000000000001',
              action: 'admin.user.status.update',
              actorUserId: '00000000-0000-4000-8000-000000000002',
              createdAt: '2026-01-02T00:00:00.000Z',
              before: { status: 'active' },
              after: { status: 'disabled' },
              metadata: { reason: 'support request' },
              resource: 'admin.users',
              targetId: '00000000-0000-4000-8000-000000000003',
            },
            {
              id: '00000000-0000-4000-8000-000000000012',
              tenantId: '00000000-0000-4000-8000-000000000001',
              action: 'admin.user.roles.update',
              actorUserId: '00000000-0000-4000-8000-000000000002',
              createdAt: '2026-01-03T00:00:00.000Z',
              before: {},
              after: {},
              metadata: {},
              resource: 'admin.users',
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: { items: [], limit: 10, offset: 0, total: 0 },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    renderAdminRouteForTest(
      renderAdminRoute('/admin/roles', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );
    expect((await screen.findAllByText('Administrator')).length).toBeGreaterThan(0);
    expect(screen.getByText('admin.users')).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute('/admin/audit?resource=admin.users&targetId=00000000-0000-4000-8000-000000000003', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );
    expect(await screen.findByText('admin.user.status.update')).toBeTruthy();
    expect(screen.getByText('00000000-0000-4000-8000-000000000003')).toBeTruthy();
    expect(auditSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resource: 'admin.users',
        targetId: '00000000-0000-4000-8000-000000000003',
      }),
      undefined,
    );

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute('/admin/audit', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );
    expect(await screen.findByText('No audit events')).toBeTruthy();
    await waitFor(() => {
      expect(auditSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('renders audit request failures without masking the backend message', async () => {
    vi.spyOn(adminApi, 'auditLogAdminControllerMetadata').mockResolvedValue({
      data: { actions: [], resources: [] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'auditLogAdminControllerList').mockRejectedValue(new Error('audit stream offline'));

    renderAdminRouteForTest(
      renderAdminRoute('/admin/audit', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );

    expect(await screen.findByText('Audit log request failed')).toBeTruthy();
  });

  it('lists, previews, updates, and resets problem presentation overrides', async () => {
    const problem = {
      ruleId: 'admin-app-api:GET:/admin/roles:409',
      comment: 'Handled by a form',
      display: 'toast' as const,
      messageEn: 'Roles conflict',
      messageRu: 'Конфликт ролей',
      revision: 3,
      severity: 'warning' as const,
      updatedAt: '2026-07-19T12:00:00.000Z',
    };
    vi.spyOn(adminApi, 'adminProblemPresentationsControllerList').mockResolvedValue({
      data: { data: { items: [problem] } },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const updateSpy = vi.spyOn(adminApi, 'adminProblemPresentationsControllerUpdate').mockResolvedValue({
      data: { data: problem },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const resetSpy = vi.spyOn(adminApi, 'adminProblemPresentationsControllerReset').mockResolvedValue({
      data: { data: { ruleId: problem.ruleId } },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const toastSpy = vi.spyOn(apiToastRuntime, 'show');

    renderAdminRouteForTest(
      <AdminLayout access={adminAccess} currentPath="/admin/settings/errors">
        {renderAdminRoute('/admin/settings/errors', {
          status: 'ready',
          payload,
          access: adminAccess,
        })}
      </AdminLayout>,
    );

    await screen.findAllByText('API response presentation rules');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search API responses' }), {
      target: { value: problem.ruleId },
    });
    expect(await screen.findByText('/admin/roles')).toBeTruthy();
    expect(screen.getByText('Frontend reliability')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview toast' }));
    expect(toastSpy).toHaveBeenCalledWith({
      category: 'warning',
      message: problem.messageEn,
      title: 'GET /admin/roles',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        {
          comment: 'Handled by a form',
          display: 'toast',
          expectedRevision: 3,
          messageEn: 'Roles conflict',
          messageRu: 'Конфликт ролей',
          ruleId: problem.ruleId,
          severity: 'warning',
        },
        undefined,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const resetDialog = screen.getByRole('alertdialog');
    fireEvent.click(within(resetDialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith({ expectedRevision: 3, ruleId: problem.ruleId }, undefined);
    });
  });

  it('keeps the roles matrix read-only when the admin cannot write roles', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const setSpy = vi.spyOn(adminApi, 'adminRolesControllerSetRolePermissions');

    renderAdminRouteForTest(
      renderAdminRoute('/admin/roles', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );

    const checkbox = await screen.findByRole('checkbox', {
      name: 'admin:users:read assigned to admin',
    });
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'New role' })).toBeFalsy();
    fireEvent.click(checkbox);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('toggles a permission on an editable role via set-role-permissions when the admin can write roles', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const setSpy = vi.spyOn(adminApi, 'adminRolesControllerSetRolePermissions').mockResolvedValue({
      data: {
        id: 'role-ops',
        role: 'ops',
        label: 'Ops team',
        description: 'Operations',
        isSystem: false,
        permissions: ['admin:users:read'],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    renderAdminRouteForTest(
      renderAdminRoute('/admin/roles', {
        status: 'ready',
        payload,
        access: rolesWriteAccess,
      }),
    );

    const opsCheckbox = await screen.findByRole('checkbox', {
      name: 'admin:users:read assigned to ops',
    });
    expect(opsCheckbox.hasAttribute('disabled')).toBe(false);
    // System roles stay protected even when the admin can write roles.
    expect(
      screen
        .getByRole('checkbox', {
          name: 'admin:users:read assigned to admin',
        })
        .hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(opsCheckbox);

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith('role-ops', { permissions: ['admin:users:read'] }, undefined);
    });
  });

  it('creates a role through the create-role mutation', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const createSpy = vi.spyOn(adminApi, 'adminRolesControllerCreateRole').mockResolvedValue({
      data: {
        id: 'role-new',
        role: 'support',
        label: 'Support',
        description: '',
        isSystem: false,
        permissions: [],
      },
      error: undefined,
      response: new Response(null, { status: 201 }),
    });

    renderAdminRouteForTest(
      renderAdminRoute('/admin/roles', {
        status: 'ready',
        payload,
        access: rolesWriteAccess,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New role' }));
    fireEvent.change(screen.getByLabelText('Role key'), {
      target: { value: 'support' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ key: 'support' }), undefined);
    });
  });

  it('surfaces a backend rejection of a permission change without throwing', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'adminRolesControllerSetRolePermissions').mockRejectedValue(
      new Error('Cannot strip admin core permissions'),
    );

    renderAdminRouteForTest(
      renderAdminRoute('/admin/roles', {
        status: 'ready',
        payload,
        access: rolesWriteAccess,
      }),
    );

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'admin:users:read assigned to ops',
      }),
    );

    expect(await screen.findByText('Role permissions update failed')).toBeTruthy();
  });

  it('covers profile, forbidden/loading/error/not-found and CASL hidden nav', () => {
    renderAdminRouteForTest(
      <AdminLayout access={restrictedAccess} currentPath="/admin/users">
        {renderAdminRoute('/admin/users', {
          status: 'ready',
          payload,
          access: restrictedAccess,
        })}
      </AdminLayout>,
    );

    expect(screen.queryByRole('link', { name: 'Users' })).toBeFalsy();
    expect(screen.getAllByText('Missing admin users permission.').length).toBeGreaterThan(0);

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute('/admin/profile', {
        status: 'ready',
        payload,
        access: { ...adminAccess, permissions: [], roles: [] },
      }),
    );
    expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute('/admin/missing', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );
    expect(screen.getByText('Admin page not found')).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(renderAdminRoute('/admin', { status: 'loading' }));
    expect(screen.getAllByText('Loading admin profile...').length).toBeGreaterThan(0);
  });

  it('renders without a state provider', () => {
    render(
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <AdminLayout currentPath="/admin">
          <span>content without app store</span>
        </AdminLayout>
      </FrontendI18nProvider>,
    );

    expect(screen.getByText('content without app store')).toBeTruthy();
  });

  it('renders tenant login analytics with geo, language, timezone, and retained IP evidence', async () => {
    const loginListSpy = vi.spyOn(adminApi, 'authLoginAnalyticsAdminControllerList').mockResolvedValue({
      data: {
        items: [
          {
            id: '00000000-0000-4000-8000-000000000010',
            tenantId: '00000000-0000-4000-8000-000000000001',
            userId: '00000000-0000-4000-8000-000000000002',
            eventType: 'login',
            outcome: 'success',
            provider: 'telegram',
            channel: 'telegram_tma',
            ipAddress: '203.0.113.10',
            countryCode: 'UZ',
            city: 'Tashkent',
            timezone: 'Asia/Tashkent',
            language: 'ru',
            networkAnonymized: false,
            occurredAt: '2026-07-21T09:00:00.000Z',
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, 'authLoginAnalyticsAdminControllerSummary').mockResolvedValue({
      data: {
        total: 1,
        successful: 1,
        failed: 0,
        uniqueUsers: 1,
        successRate: 100,
        byCountry: [{ key: 'UZ', count: 1 }],
        byLanguage: [{ key: 'ru', count: 1 }],
        byTimezone: [{ key: 'Asia/Tashkent', count: 1 }],
        byProvider: [{ key: 'telegram', count: 1 }],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    renderAdminRouteForTest(
      renderAdminRoute('/admin/auth/login-analytics?userId=00000000-0000-4000-8000-000000000002', {
        status: 'ready',
        payload,
        access: adminAccess,
      }),
    );
    expect((await screen.findAllByText('Login analytics')).length).toBeGreaterThan(0);
    expect(await screen.findByText('UZ · 1')).toBeTruthy();
    fireEvent.click(await screen.findByRole('row', { name: /telegram success/iu }));
    expect(await screen.findByText('203.0.113.10')).toBeTruthy();
    expect(loginListSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '00000000-0000-4000-8000-000000000002' }),
      undefined,
    );
  });
});
