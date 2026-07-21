import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateUserAccessPolicy } from '../../features/user-access-management';
import {
  parseAdminUserRoleFilter,
  parseAdminUserPermissionFilter,
  parseAdminUsersPage,
  parseAdminUserStatusFilter,
  toUserListParams,
} from '../../features/user-filtering';
import { updateUserStatus } from '../../features/user-status-management';
import { assignUserRoles } from '../../features/user-role-assignment';
import {
  AdminAuditReadPermission,
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersWritePermission,
  UserProfileReadPermission,
  UserRole,
} from '@app/common-authz';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  AdminSearchFilterToolbar,
  UiActionsMenu,
  UiCard,
  UiCheckbox,
  UiConfirmDialog,
  UiDataTable,
  UiNotification,
  UiPagination,
  UiSection,
  UiSelect,
  UiStatusTag,
  UiTextarea,
} from '@app/frontend-ui-web';
import { ResourceAuditLogCard } from '../../entities/admin-audit';
import type { AdminAccess } from '../../entities/admin-session';
import { UserDetailCard, type UserRow, type UserStatus } from '../../entities/admin-user';
import {
  errorText,
  pageSize,
  paramsFromPath,
  routeUserId,
  join,
  statusLabelKey,
  statusTone,
  totalPages,
} from '../../shared';

type PolicyRole = adminApi.UpdateAdminUserAccessPolicyDto['roles'][number];
type PolicyPermission = adminApi.UpdateAdminUserAccessPolicyDto['permissions'][number];

// Roles/permissions come from the shared @app/common-authz catalog. The
// `satisfies` checks keep them aligned with the generated DTO union so selected
// values stay typed without an unchecked `as` cast.
const policyRoleValues = [UserRole, AdminRole] as const satisfies readonly PolicyRole[];

const policyPermissionValues = [
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
] as const satisfies readonly PolicyPermission[];

const isPolicyRole = (value: string): value is PolicyRole => policyRoleValues.some((role) => role === value);

const isPolicyPermission = (value: string): value is PolicyPermission =>
  policyPermissionValues.some((permission) => permission === value);

export const UsersPage = ({
  access,
  currentPath,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  currentPath: string;
  requestOptions?: ApiClientRequestOptions;
}>) => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const initial = paramsFromPath(currentPath);
  const [search, setSearch] = useState(initial.get('search') ?? '');
  const [status, setStatus] = useState(parseAdminUserStatusFilter(initial.get('status')));
  const [role, setRole] = useState(parseAdminUserRoleFilter(initial.get('role')));
  const [permission, setPermission] = useState(parseAdminUserPermissionFilter(initial.get('permission')));
  const [page, setPage] = useState(parseAdminUsersPage(initial.get('page')));
  const [selected, setSelected] = useState(routeUserId(currentPath));
  const [notice, setNotice] = useState<{
    tone: 'success' | 'warning';
    message: string;
  }>();
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    email: string;
    nextStatus: UserStatus;
  }>();
  const [policyTarget, setPolicyTarget] = useState<UserRow>();
  const [policyStatus, setPolicyStatus] = useState<UserStatus>('active');
  const [rolesTarget, setRolesTarget] = useState<UserRow>();
  const [assignedRoles, setAssignedRoles] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [policyRoles, setPolicyRoles] = useState<Set<string>>(new Set());
  const [policyPermissions, setPolicyPermissions] = useState<Set<string>>(new Set());
  const listParams = useMemo<adminApi.AdminUsersListQuery>(
    () => toUserListParams({ page, permission, role, search, status }),
    [page, permission, role, search, status],
  );
  const users = useQuery({
    queryKey: [...adminApi.getAdminUsersControllerListUsersQueryKey(listParams), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminUsersControllerListUsers(listParams, requestOptions)),
    retry: false,
  });
  const roles = useQuery({
    queryKey: [...adminApi.getAdminUsersControllerRolesQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminUsersControllerRoles(requestOptions)),
    retry: false,
  });
  const detail = useQuery({
    enabled: Boolean(selected),
    queryKey: [...adminApi.getAdminUsersControllerGetUserQueryKey(selected ?? ''), requestOptions] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        /* v8 ignore next -- the detail query is enabled only after a user id is selected. */
        adminApi.adminUsersControllerGetUser(selected ?? '', requestOptions),
      ),
    retry: false,
  });
  const refetchCurrent = async () => {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: adminApi.getAdminUsersControllerListUsersQueryKey(listParams),
      }),
      qc.invalidateQueries({
        queryKey: adminApi.getAdminUsersControllerGetUserQueryKey(String(selected)),
      }),
      qc.invalidateQueries({
        queryKey: adminApi.getAdminUsersControllerDashboardSummaryQueryKey(),
      }),
    ]);
  };
  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus, reason: auditReason }: { id: string; nextStatus: UserStatus; reason: string }) =>
      updateUserStatus(id, nextStatus, auditReason, requestOptions),
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.users.notice.statusUpdateRequested'),
      });
      await refetchCurrent();
    },
    onError: (error) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.users.error.statusUpdateFailed', t),
      });
    },
  });
  const policyMutation = useMutation({
    mutationFn: ({
      id,
      roles,
      permissions,
      reason: auditReason,
      status: nextStatus,
      currentStatus,
    }: {
      id: string;
      roles: ('user' | 'admin')[];
      permissions: adminApi.UpdateAdminUserAccessPolicyDto['permissions'];
      reason: string;
      status?: UserStatus;
      currentStatus?: UserStatus;
    }) => {
      if (nextStatus && nextStatus !== currentStatus) {
        return updateUserStatus(id, nextStatus, auditReason, requestOptions).then(() =>
          updateUserAccessPolicy(id, { roles, permissions, reason: auditReason }, requestOptions),
        );
      }

      return updateUserAccessPolicy(id, { roles, permissions, reason: auditReason }, requestOptions);
    },
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.users.notice.accessPolicyUpdateRequested'),
      });
      await refetchCurrent();
    },
    onError: (error) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.users.error.accessPolicyUpdateFailed', t),
      });
    },
  });
  const rolesMutation = useMutation({
    mutationFn: ({ id, roles: nextRoles }: { id: string; roles: adminApi.AssignAdminUserRolesDto['roles'] }) =>
      assignUserRoles(id, nextRoles, requestOptions),
    onSuccess: async () => {
      setNotice({
        tone: 'success',
        message: t('admin.users.notice.rolesAssignmentRequested'),
      });
      await refetchCurrent();
    },
    onError: (error) => {
      setNotice({
        tone: 'warning',
        message: errorText(error, 'admin.users.error.rolesAssignmentFailed', t),
      });
    },
  });
  const rows = users.data?.items ?? [];
  const roleOptions = [
    { label: t('admin.users.filter.allRoles'), value: 'all' },
    ...(roles.data?.assignableRoles ?? access.roles).map((value) => ({
      label: value,
      value,
    })),
  ];
  const permissionOptions = [
    { label: t('admin.users.filter.allPermissions'), value: 'all' },
    ...(roles.data?.assignablePermissions ?? access.permissions).map((value) => ({ label: value, value })),
  ];
  const statusOptions = [
    { label: t('admin.status.active'), value: 'active' },
    { label: t('admin.status.disabled'), value: 'disabled' },
    { label: t('admin.status.invited'), value: 'invited' },
  ];
  return (
    <UiSection
      className="admin-page admin-users-page"
      eyebrow={t('admin.users.eyebrow')}
      title={t('admin.users.title')}
    >
      <UiCard className="admin-filter-card" title={t('admin.users.searchLabel')}>
        <AdminSearchFilterToolbar
          searchLabel={t('admin.users.searchLabel')}
          searchPlaceholder={t('admin.users.searchPlaceholder')}
          searchValue={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onSubmit={() => {
            setPage(1);
          }}
        >
          <UiSelect
            label={t('admin.users.filter.status')}
            value={status}
            onValueChange={(v) => {
              setStatus(parseAdminUserStatusFilter(v));
              setPage(1);
            }}
            options={[{ label: t('admin.users.filter.allStatuses'), value: 'all' }, ...statusOptions]}
          />
          <UiSelect
            label={t('admin.users.filter.role')}
            value={role}
            onValueChange={(v) => {
              setRole(parseAdminUserRoleFilter(v));
              setPage(1);
            }}
            options={roleOptions}
          />
          <UiSelect
            label={t('admin.users.filter.permission')}
            value={permission}
            onValueChange={(v) => {
              setPermission(parseAdminUserPermissionFilter(v));
              setPage(1);
            }}
            options={permissionOptions}
          />
        </AdminSearchFilterToolbar>
      </UiCard>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      <div className="admin-users-split">
        <div className="admin-users-table-panel">
          <UiCard className="admin-table-card" title={t('admin.users.title')}>
            <UiDataTable<UserRow>
              rows={rows}
              rowKey={(row) => row.id}
              isLoading={users.isLoading}
              loadingLabel={t('admin.users.loading')}
              error={users.error ? errorText(users.error, 'admin.users.error.requestFailed', t) : undefined}
              emptyTitle={t('admin.users.emptyEyebrow')}
              emptyDescription={t('admin.users.emptyTitle')}
              onRowClick={(row) => {
                setSelected(row.id);
              }}
              getRowAriaLabel={(row) => t('admin.users.row.open', { email: row.email })}
              columns={[
                {
                  id: 'email',
                  header: t('admin.users.column.email'),
                  render: (row) => (
                    <span className="admin-user-cell">
                      <strong>{row.email}</strong>
                      <small>{row.tenantId}</small>
                    </span>
                  ),
                },
                {
                  id: 'status',
                  header: t('admin.users.column.status'),
                  render: (row) => <UiStatusTag label={t(statusLabelKey[row.status])} tone={statusTone[row.status]} />,
                },
                {
                  id: 'roles',
                  header: t('admin.users.column.roles'),
                  render: (row) => (
                    <span className="admin-chip-row">
                      {row.roles.length
                        ? row.roles.map((rowRole) => (
                            <span className="admin-chip" key={rowRole}>
                              {rowRole}
                            </span>
                          ))
                        : join(row.roles)}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: t('admin.users.column.actions'),
                  render: (row) => {
                    const nextStatus = row.status === 'active' ? 'disabled' : 'active';
                    return (
                      <UiActionsMenu
                        items={[
                          {
                            label: t('admin.users.action.changeStatus'),
                            disabled: !access.canUpdateUserStatus,
                            tone: nextStatus === 'disabled' ? 'warning' : 'default',
                            onSelect: () => {
                              setReason('');
                              setStatusTarget({
                                id: row.id,
                                email: row.email,
                                nextStatus,
                              });
                            },
                          },
                          {
                            label: t('admin.users.action.editAccessPolicy'),
                            disabled: !access.canUpdateUserAccessPolicy,
                            onSelect: () => {
                              setReason('');
                              setPolicyTarget(row);
                              setPolicyStatus(row.status);
                              setPolicyRoles(new Set(row.roles));
                              setPolicyPermissions(new Set(row.permissions));
                            },
                          },
                          {
                            label: t('admin.users.action.assignRoles'),
                            disabled: !access.canWriteRoles,
                            onSelect: () => {
                              setRolesTarget(row);
                              setAssignedRoles(new Set(row.roles));
                            },
                          },
                        ]}
                      />
                    );
                  },
                },
              ]}
            />
          </UiCard>
          <UiPagination
            currentPage={page}
            pageSize={users.data?.limit ?? pageSize}
            totalItems={users.data?.total ?? 0}
            totalPages={totalPages(users.data?.total, users.data?.limit)}
            onPageChange={setPage}
          />
        </div>
        <div className="admin-user-side-panel">
          <UiCard className="admin-detail-panel" title={t('admin.users.detail.title')}>
            <UserDetailCard detail={detail} t={t} />
            {detail.data && access.canReadAuthLoginAnalytics ? (
              <a
                className="admin-resource-history-link"
                href={`/admin/auth/login-analytics?userId=${encodeURIComponent(detail.data.id)}`}
              >
                {t('admin.users.detail.viewLoginHistory')}
              </a>
            ) : null}
          </UiCard>
          {detail.data && access.canReadAudit ? (
            <ResourceAuditLogCard requestOptions={requestOptions} resource="admin.users" targetId={detail.data.id} />
          ) : null}
        </div>
      </div>
      {statusTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setStatusTarget(undefined);
          }}
          title={t('admin.users.statusDialog.eyebrow')}
          description={t('admin.users.statusDialog.description', {
            email: statusTarget.email,
            status: t(statusLabelKey[statusTarget.nextStatus]),
          })}
          confirmLabel={t('admin.users.statusDialog.title')}
          onConfirm={() => {
            if (!reason.trim()) {
              setNotice({
                tone: 'warning',
                message: t('admin.users.error.statusReasonRequired'),
              });
              return;
            }
            statusMutation.mutate({
              id: statusTarget.id,
              nextStatus: statusTarget.nextStatus,
              reason: reason.trim(),
            });
            setStatusTarget(undefined);
          }}
        >
          <UiTextarea
            aria-label={t('admin.users.statusDialog.reasonLabel')}
            placeholder={t('admin.users.reasonPlaceholder')}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
          />
        </UiConfirmDialog>
      ) : null}
      {policyTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setPolicyTarget(undefined);
            setPolicyStatus('active');
          }}
          title={t('admin.users.policyDialog.eyebrow')}
          description={t('admin.users.policyDialog.description', {
            email: policyTarget.email,
          })}
          confirmLabel={t('admin.users.policyDialog.title')}
          onConfirm={() => {
            if (!reason.trim()) {
              setNotice({
                tone: 'warning',
                message: t('admin.users.error.policyReasonRequired'),
              });
              return;
            }
            if (policyRoles.size === 0) {
              setNotice({
                tone: 'warning',
                message: t('admin.users.error.roleRequired'),
              });
              return;
            }
            policyMutation.mutate({
              id: policyTarget.id,
              currentStatus: policyTarget.status,
              status: policyStatus,
              roles: [...policyRoles].filter(isPolicyRole),
              permissions: [...policyPermissions].filter(isPolicyPermission),
              reason: reason.trim(),
            });
            setPolicyTarget(undefined);
            setPolicyStatus('active');
          }}
        >
          <UiSelect
            label={t('admin.users.filter.status')}
            value={policyStatus}
            onValueChange={(value) => {
              setPolicyStatus(value as UserStatus);
            }}
            options={statusOptions}
          />
          <div className="xr-card-grid">
            {(roles.data?.assignableRoles ?? ['user', 'admin']).map((value) => (
              <UiCheckbox
                key={value}
                label={value}
                checked={policyRoles.has(value)}
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  setPolicyRoles((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(value);
                    } else {
                      next.delete(value);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
          <div className="xr-card-grid">
            {(roles.data?.assignablePermissions ?? access.permissions).map((value) => (
              <UiCheckbox
                key={value}
                label={value}
                checked={policyPermissions.has(value)}
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  setPolicyPermissions((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(value);
                    } else {
                      next.delete(value);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
          <UiTextarea
            aria-label={t('admin.users.policyDialog.reasonLabel')}
            placeholder={t('admin.users.reasonPlaceholder')}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
            }}
          />
        </UiConfirmDialog>
      ) : null}
      {rolesTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setRolesTarget(undefined);
          }}
          title={t('admin.users.rolesDialog.eyebrow')}
          description={t('admin.users.rolesDialog.description', {
            email: rolesTarget.email,
          })}
          confirmLabel={t('admin.users.rolesDialog.title')}
          onConfirm={() => {
            if (assignedRoles.size === 0) {
              setNotice({
                tone: 'warning',
                message: t('admin.users.error.roleRequired'),
              });
              return;
            }
            rolesMutation.mutate({
              id: rolesTarget.id,
              roles: [...assignedRoles].filter(isPolicyRole),
            });
            setRolesTarget(undefined);
          }}
        >
          <div className="xr-card-grid">
            {(roles.data?.assignableRoles ?? ['user', 'admin']).map((value) => (
              <UiCheckbox
                key={value}
                label={value}
                checked={assignedRoles.has(value)}
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  setAssignedRoles((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(value);
                    } else {
                      next.delete(value);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </UiConfirmDialog>
      ) : null}
    </UiSection>
  );
};
