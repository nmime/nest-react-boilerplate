import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminAuditReadPermission,
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersWritePermission,
  UserProfileReadPermission,
} from '@app/common-authz';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmDialog,
  UiDataTable,
  UiInput,
  UiNotification,
  UiSection,
  UiStatCard,
  UiStatusTag,
  UiTextarea,
} from '@app/frontend-ui-web';
import { createRole, setRolePermissions, updateRole } from '../../features/role-management';
import type { AdminAccess } from '../../entities/admin-session';
import type { RoleRow } from '../../entities/admin-role';
import { errorText } from '../../shared';

type RoleColumn = adminApi.AdminRbacCatalogPayloadDto['roles'][number];
type RolePermission = adminApi.SetAdminRolePermissionsDto['permissions'][number];

// Permission identifiers come from the shared @app/common-authz catalog. The
// `satisfies` check keeps them aligned with the generated DTO union so values
// stay typed without an unchecked `as` cast.
const rolePermissionValues = [
  UserProfileReadPermission,
  AdminDashboardReadPermission,
  AdminProfileReadPermission,
  AdminUsersReadPermission,
  AdminUsersWritePermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminAuditReadPermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminManageAllPermission,
] as const satisfies readonly RolePermission[];

const isRolePermission = (value: string): value is RolePermission =>
  rolePermissionValues.some((permission) => permission === value);

export const RolesPage = ({
  access,
  requestOptions,
}: Readonly<{
  access?: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
}>) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canWriteRoles = Boolean(access?.canWriteRoles);
  const [notice, setNotice] = useState<{
    tone: 'success' | 'warning';
    message: string;
  }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editTarget, setEditTarget] = useState<RoleColumn>();
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const roles = useQuery({
    queryKey: [...adminApi.getAdminUsersControllerRolesQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminUsersControllerRoles(requestOptions)),
    retry: false,
  });
  const rows = roles.data?.permissions ?? [];
  const roleCatalog = roles.data?.roles ?? [];

  const refetchRoles = () =>
    qc.invalidateQueries({
      queryKey: adminApi.getAdminUsersControllerRolesQueryKey(),
    });

  const permissionsMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: RolePermission[] }) =>
      setRolePermissions(id, permissions, requestOptions),
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.roles.notice.permissionsUpdated'),
      });
      await refetchRoles();
    },
    onError: (error: unknown) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.roles.error.permissionsUpdateFailed', t),
      });
    },
  });
  const createMutation = useMutation({
    mutationFn: (body: adminApi.CreateAdminRoleDto) => createRole(body, requestOptions),
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.roles.notice.roleCreated'),
      });
      await refetchRoles();
    },
    onError: (error: unknown) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.roles.error.createFailed', t),
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: adminApi.UpdateAdminRoleDto }) =>
      updateRole(id, body, requestOptions),
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.roles.notice.roleUpdated'),
      });
      await refetchRoles();
    },
    onError: (error: unknown) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.roles.error.updateFailed', t),
      });
    },
  });

  const isRoleEditable = (role: RoleColumn) => canWriteRoles && !role.isSystem;

  const togglePermission = (role: RoleColumn, permission: string, checked: boolean) => {
    const next = new Set(role.permissions);
    if (checked) {
      next.add(permission);
    } else {
      next.delete(permission);
    }
    permissionsMutation.mutate({
      id: role.id,
      permissions: [...next].filter(isRolePermission),
    });
  };

  const openEdit = (role: RoleColumn) => {
    setEditTarget(role);
    setEditLabel(role.label);
    setEditDescription(role.description);
  };

  return (
    <UiSection
      className="admin-page admin-roles-page"
      eyebrow={t('admin.roles.eyebrow')}
      title={t('admin.roles.title')}
    >
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.users.filter.role')}
          value={`${roles.data?.roles.length ?? '—'}`}
          detail={t('admin.roles.title')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.users.filter.permission')}
          value={`${rows.length || '—'}`}
          detail={t('admin.roles.emptyTitle')}
        />
      </div>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {canWriteRoles ? (
        <UiCard className="admin-table-card" title={t('admin.roles.manage.title')}>
          <div className="admin-table-toolbar">
            <UiButton
              onClick={() => {
                setNewKey('');
                setNewLabel('');
                setNewDescription('');
                setCreateOpen(true);
              }}
            >
              {t('admin.roles.action.newRole')}
            </UiButton>
          </div>
          <div className="admin-chip-row">
            {roleCatalog.map((role) => (
              <span className="admin-chip admin-chip--strong" key={role.id}>
                {role.label}
                {role.isSystem ? <UiStatusTag label={t('admin.roles.manage.systemBadge')} tone="info" /> : null}
                <UiButton
                  variant="ghost"
                  onClick={() => {
                    openEdit(role);
                  }}
                >
                  {t('admin.roles.action.editRole')}
                </UiButton>
              </span>
            ))}
          </div>
        </UiCard>
      ) : null}
      <UiCard className="admin-table-card" title={t('admin.roles.title')}>
        <UiDataTable<RoleRow>
          rows={rows}
          rowKey={(row) => row.permission}
          isLoading={roles.isLoading}
          loadingLabel={t('admin.roles.loading')}
          error={roles.error ? errorText(roles.error, 'admin.roles.error.requestFailed', t) : undefined}
          emptyTitle={t('admin.roles.emptyEyebrow')}
          emptyDescription={t('admin.roles.emptyTitle')}
          columns={[
            {
              id: 'permission',
              header: t('admin.roles.column.permission'),
              render: (row) => row.permission,
            },
            {
              id: 'resource',
              header: t('admin.roles.column.resource'),
              render: (row) => row.resource,
            },
            {
              id: 'action',
              header: t('admin.roles.column.action'),
              render: (row) => row.action,
            },
            ...roleCatalog.map((role) => ({
              id: role.role,
              header: role.label,
              align: 'center' as const,
              render: (row: RoleRow) => (
                <UiCheckbox
                  disabled={!isRoleEditable(role) || permissionsMutation.isPending}
                  checked={role.permissions.includes(row.permission)}
                  onCheckedChange={(checked: boolean | 'indeterminate') => {
                    togglePermission(role, row.permission, checked === true);
                  }}
                  label={t('admin.roles.assignmentLabel', {
                    permission: row.permission,
                    role: role.role,
                  })}
                />
              ),
            })),
          ]}
        />
      </UiCard>
      <UiConfirmDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('admin.roles.createDialog.title')}
        description={t('admin.roles.createDialog.description')}
        confirmLabel={t('admin.roles.createDialog.title')}
        onConfirm={() => {
          if (!newKey.trim()) {
            setNotice({
              tone: 'warning',
              message: t('admin.roles.error.keyRequired'),
            });
            return;
          }
          createMutation.mutate({
            key: newKey.trim(),
            ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
            ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
          });
          setCreateOpen(false);
        }}
      >
        <UiInput
          aria-label={t('admin.roles.field.key')}
          value={newKey}
          onChange={(event) => {
            setNewKey(event.currentTarget.value);
          }}
        />
        <UiInput
          aria-label={t('admin.roles.field.label')}
          value={newLabel}
          onChange={(event) => {
            setNewLabel(event.currentTarget.value);
          }}
        />
        <UiTextarea
          aria-label={t('admin.roles.field.description')}
          value={newDescription}
          onChange={(event) => {
            setNewDescription(event.currentTarget.value);
          }}
        />
      </UiConfirmDialog>
      {editTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setEditTarget(undefined);
          }}
          title={t('admin.roles.editDialog.title')}
          description={t('admin.roles.editDialog.description', {
            role: editTarget.role,
          })}
          confirmLabel={t('admin.roles.editDialog.title')}
          onConfirm={() => {
            updateMutation.mutate({
              id: editTarget.id,
              body: {
                label: editLabel.trim(),
                description: editDescription.trim(),
              },
            });
            setEditTarget(undefined);
          }}
        >
          <UiInput
            aria-label={t('admin.roles.field.label')}
            value={editLabel}
            onChange={(event) => {
              setEditLabel(event.currentTarget.value);
            }}
          />
          <UiTextarea
            aria-label={t('admin.roles.field.description')}
            value={editDescription}
            onChange={(event) => {
              setEditDescription(event.currentTarget.value);
            }}
          />
        </UiConfirmDialog>
      ) : null}
    </UiSection>
  );
};
