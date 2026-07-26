// @requirements REQ-FRONTEND-SHELL-004
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../entities/admin-session';
import { RolesPage } from '../pages/roles';

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
}

const rolesWriteAccess = createAdminAccess({
  subject: 'admin-id',
  roles: ['admin'],
  permissions: ['admin:roles:read', 'admin:roles:write', 'admin:users:read'],
});

const editableRolesCatalog = {
  resources: ['admin.users'],
  assignableRoles: ['user', 'admin', 'ops'],
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
      id: 'role-ops',
      role: 'ops',
      label: 'Ops team',
      description: 'Operations',
      isSystem: false,
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

const ok = <T,>(data: T, status = 200) => ({
  data,
  error: undefined,
  response: new Response(null, { status }),
});

const AdminTestProviders = ({ children }: Readonly<{ children: ReactElement }>) => (
  <FrontendStateProvider>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const renderRolesPage = () => {
  vi.spyOn(adminApi, 'adminUsersControllerRoles').mockResolvedValue(ok(editableRolesCatalog));
  return render(
    <AdminTestProviders>
      <RolesPage access={rolesWriteAccess} />
    </AdminTestProviders>,
  );
};

describe('admin roles page management', () => {
  beforeEach(() => {
    installRadixPointerMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('removes an assigned permission from an editable role', async () => {
    const setSpy = vi.spyOn(adminApi, 'adminRolesControllerSetRolePermissions').mockResolvedValue(
      ok({
        id: 'role-ops',
        role: 'ops',
        label: 'Ops team',
        description: 'Operations',
        isSystem: false,
        permissions: [],
      }),
    );

    renderRolesPage();

    const checkbox = await screen.findByRole('checkbox', {
      name: 'admin:users:read assigned to ops',
    });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith('role-ops', { permissions: [] }, undefined);
    });
  });

  it('edits a role label and description', async () => {
    const updateSpy = vi.spyOn(adminApi, 'adminRolesControllerUpdateRole').mockResolvedValue(
      ok({
        id: 'role-ops',
        role: 'ops',
        label: 'Operations crew',
        description: 'Updated',
        isSystem: false,
        permissions: ['admin:users:read'],
      }),
    );

    renderRolesPage();

    const editButtons = await screen.findAllByRole('button', {
      name: 'Edit role',
    });
    fireEvent.click(editButtons.at(-1) as HTMLElement);

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Label'), {
      target: { value: 'Operations crew' },
    });
    fireEvent.change(within(dialog).getByLabelText('Description'), {
      target: { value: 'Updated' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit role' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'role-ops',
        { label: 'Operations crew', description: 'Updated' },
        undefined,
      );
    });
    expect(await screen.findByText('Role updated.')).toBeTruthy();
  });

  it('cancels the edit dialog without updating', async () => {
    const updateSpy = vi.spyOn(adminApi, 'adminRolesControllerUpdateRole');

    renderRolesPage();

    const editButtons = await screen.findAllByRole('button', {
      name: 'Edit role',
    });
    fireEvent.click(editButtons.at(-1) as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeFalsy();
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('surfaces a backend rejection of a role update', async () => {
    vi.spyOn(adminApi, 'adminRolesControllerUpdateRole').mockRejectedValue(new Error('role update backend rejected'));

    renderRolesPage();

    const editButtons = await screen.findAllByRole('button', {
      name: 'Edit role',
    });
    fireEvent.click(editButtons.at(-1) as HTMLElement);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit role' }));

    expect(await screen.findByText('Role update failed')).toBeTruthy();
  });

  it('creates a role with a key, label, and description', async () => {
    const createSpy = vi.spyOn(adminApi, 'adminRolesControllerCreateRole').mockResolvedValue(
      ok(
        {
          id: 'role-support',
          role: 'support',
          label: 'Support team',
          description: 'Support desk',
          isSystem: false,
          permissions: [],
        },
        201,
      ),
    );

    renderRolesPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Role key'), {
      target: { value: 'support' },
    });
    fireEvent.change(within(dialog).getByLabelText('Label'), {
      target: { value: 'Support team' },
    });
    fireEvent.change(within(dialog).getByLabelText('Description'), {
      target: { value: 'Support desk' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        {
          key: 'support',
          label: 'Support team',
          description: 'Support desk',
        },
        undefined,
      );
    });
  });

  it('requires a role key before creating a role', async () => {
    const createSpy = vi.spyOn(adminApi, 'adminRolesControllerCreateRole');

    renderRolesPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText('Enter a role key before creating a role.')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('surfaces a backend rejection of role creation', async () => {
    vi.spyOn(adminApi, 'adminRolesControllerCreateRole').mockRejectedValue(new Error('role creation backend rejected'));

    renderRolesPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Role key'), {
      target: { value: 'support' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText('Role creation failed')).toBeTruthy();
  });

  it('renders the roles catalog error state', async () => {
    vi.spyOn(adminApi, 'adminUsersControllerRoles').mockRejectedValue(new Error('roles catalog offline'));

    render(
      <AdminTestProviders>
        <RolesPage access={rolesWriteAccess} />
      </AdminTestProviders>,
    );

    expect(await screen.findByText('Roles catalog request failed')).toBeTruthy();
  });
});
