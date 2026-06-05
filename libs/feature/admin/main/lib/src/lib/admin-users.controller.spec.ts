import { BadRequestException, NotFoundException } from "@nestjs/common";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal } from "@app/feature-auth-shared";
import {
  ADMIN_AUDIT_READ_PERMISSION,
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_ROLE,
  ADMIN_ROLES_READ_PERMISSION,
  ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  ADMIN_USERS_READ_PERMISSION,
  ADMIN_USERS_STATUS_UPDATE_PERMISSION,
  ADMIN_USERS_WRITE_PERMISSION,
  USER_PROFILE_READ_PERMISSION,
} from "@app/feature-admin-shared";
import type {
  AdminAuditLogEntity,
  AuthUserEntity,
} from "@app/postgres-main-auth";
import { AdminUsersController } from "./admin-users.controller";

const tenantId = "00000000-0000-0000-0000-000000000000";

const principal: AuthenticatedPrincipal = {
  subject: "actor-id",
  tenantId,
  email: "admin@example.com",
  roles: [ADMIN_ROLE],
  permissions: [
    ADMIN_USERS_READ_PERMISSION,
    ADMIN_USERS_STATUS_UPDATE_PERMISSION,
    ADMIN_USERS_WRITE_PERMISSION,
    ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
    ADMIN_ROLES_READ_PERMISSION,
    ADMIN_AUDIT_READ_PERMISSION,
    ADMIN_DASHBOARD_READ_PERMISSION,
  ],
};

type TestAuthUser = Pick<
  AuthUserEntity,
  | "id"
  | "tenantId"
  | "email"
  | "displayName"
  | "passwordHash"
  | "status"
  | "roles"
  | "permissions"
  | "locale"
  | "theme"
  | "lastLoginAt"
  | "createdAt"
  | "updatedAt"
>;

type TestAdminAuditLog = Pick<
  AdminAuditLogEntity,
  | "id"
  | "tenantId"
  | "actorUserId"
  | "action"
  | "resource"
  | "targetUserId"
  | "before"
  | "after"
  | "metadata"
  | "createdAt"
>;

const createUser = (partial: Partial<TestAuthUser> = {}): TestAuthUser => ({
  id: "user-id",
  tenantId,
  email: "user@example.com",
  displayName: "User",
  passwordHash: "redacted-hash",
  status: "active",
  roles: ["user"],
  permissions: [USER_PROFILE_READ_PERMISSION],
  locale: "en",
  theme: "system",
  lastLoginAt: new Date(0),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...partial,
});

const createAuditLog = (
  partial: Partial<TestAdminAuditLog> = {},
): TestAdminAuditLog => ({
  id: "audit-id",
  tenantId,
  actorUserId: "actor-id",
  action: "admin.user.status.update",
  resource: "admin.users",
  targetUserId: "user-id",
  before: { status: "active" },
  after: { status: "disabled" },
  metadata: { requestId: "req-1" },
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  ...partial,
});

const createController = () => {
  const users = {
    listUsers: vi.fn(() => okAsync([createUser()])),
    countUsers: vi.fn(() => okAsync(1)),
    findById: vi.fn(() => okAsync(createUser())),
    setAccessPolicy: vi.fn(() => okAsync(createUser({ status: "disabled" }))),
  };
  const auditLogs = {
    record: vi.fn(() => okAsync(createAuditLog())),
    list: vi.fn(() => okAsync([createAuditLog()])),
    count: vi.fn(() => okAsync(1)),
  };

  return {
    auditLogs,
    controller: new AdminUsersController(users as never, auditLogs as never),
    users,
  };
};

describe("AdminUsersController", () => {
  it("lists users with a defensive allowlisted filter", async () => {
    const { controller, users } = createController();

    await expect(
      controller.listUsers(principal, {
        limit: 10,
        offset: 5,
        search: " user ",
        status: "active",
        role: "user",
        permission: USER_PROFILE_READ_PERMISSION,
      }),
    ).resolves.toEqual({
      data: {
        items: [
          {
            id: "user-id",
            tenantId,
            email: "user@example.com",
            displayName: "User",
            status: "active",
            roles: ["user"],
            permissions: [USER_PROFILE_READ_PERMISSION],
            locale: "en",
            theme: "system",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 10,
        offset: 5,
      },
    });
    expect(users.listUsers).toHaveBeenCalledWith({
      tenantId,
      limit: 10,
      offset: 5,
      search: "user",
      status: "active",
      role: "user",
      permission: USER_PROFILE_READ_PERMISSION,
    });
  });

  it("updates status and emits a redacted audit event", async () => {
    const { auditLogs, controller, users } = createController();

    await expect(
      controller.updateUserStatus(
        principal,
        "user-id",
        { status: "disabled" },
        { headers: { "x-request-id": "req-1" } },
      ),
    ).resolves.toMatchObject({ data: { status: "disabled" } });
    expect(users.setAccessPolicy).toHaveBeenCalledWith(
      "user-id",
      { status: "disabled" },
      tenantId,
    );
    expect(auditLogs.record).toHaveBeenCalledWith({
      tenantId,
      actorUserId: "actor-id",
      action: "admin.user.status.update",
      resource: "admin.users",
      targetUserId: "user-id",
      before: { status: "active" },
      after: { status: "disabled" },
      metadata: { requestId: "req-1" },
    });
  });

  it("updates access policy, rejects unknown grants, and never includes secrets in audit snapshots", async () => {
    const { auditLogs, controller, users } = createController();
    users.setAccessPolicy.mockReturnValue(
      okAsync(
        createUser({
          roles: ["user", ADMIN_ROLE],
          permissions: [
            USER_PROFILE_READ_PERMISSION,
            ADMIN_USERS_READ_PERMISSION,
          ],
        }),
      ),
    );

    await expect(
      controller.updateUserAccessPolicy(
        principal,
        "user-id",
        {
          roles: ["user", ADMIN_ROLE],
          permissions: [
            USER_PROFILE_READ_PERMISSION,
            ADMIN_USERS_READ_PERMISSION,
          ],
        },
        { headers: {} },
      ),
    ).resolves.toMatchObject({ data: { roles: ["user", ADMIN_ROLE] } });
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.user.access_policy.update",
        before: {
          roles: ["user"],
          permissions: [USER_PROFILE_READ_PERMISSION],
          status: "active",
        },
        after: {
          roles: ["user", ADMIN_ROLE],
          permissions: [
            USER_PROFILE_READ_PERMISSION,
            ADMIN_USERS_READ_PERMISSION,
          ],
          status: "active",
        },
      }),
    );
    expect(JSON.stringify(auditLogs.record.mock.calls[0][0])).not.toContain(
      "redacted-hash",
    );

    await expect(
      controller.updateUserAccessPolicy(
        principal,
        "user-id",
        { roles: ["owner"], permissions: ["*"] },
        { headers: {} },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks self lockout and last-active-admin sensitive mutations", async () => {
    const { controller, users } = createController();
    const adminUser = createUser({
      id: principal.subject,
      roles: [ADMIN_ROLE],
      permissions: [
        USER_PROFILE_READ_PERMISSION,
        ADMIN_USERS_WRITE_PERMISSION,
        ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
      ],
    });
    users.findById.mockReturnValue(okAsync(adminUser));

    await expect(
      controller.updateUserStatus(
        principal,
        principal.subject,
        { status: "disabled" },
        { headers: {} },
      ),
    ).rejects.toThrow("own active admin write access");

    users.findById.mockReturnValue(
      okAsync({ ...adminUser, id: "other-admin" }),
    );
    users.countUsers.mockReturnValue(okAsync(1));
    await expect(
      controller.updateUserStatus(
        principal,
        "other-admin",
        { status: "disabled" },
        { headers: {} },
      ),
    ).rejects.toThrow("At least one active administrator");

    users.countUsers.mockReturnValue(okAsync(2));
    await expect(
      controller.updateUserAccessPolicy(
        principal,
        "other-admin",
        { roles: ["user"], permissions: [USER_PROFILE_READ_PERMISSION] },
        { headers: {} },
      ),
    ).resolves.toMatchObject({ data: { status: "disabled" } });
  });

  it("returns roles catalog, audit log, dashboard metrics, and 404 for missing users", async () => {
    const { controller, users } = createController();

    const roles = controller.roles();
    expect(roles.data.assignableRoles).toEqual(["user", ADMIN_ROLE]);
    expect(roles.data.permissions).toContainEqual(
      expect.objectContaining({ permission: ADMIN_USERS_READ_PERMISSION }),
    );
    await expect(controller.listAudit(principal, {})).resolves.toMatchObject({
      data: { total: 1, items: [expect.objectContaining({ id: "audit-id" })] },
    });
    await expect(controller.dashboardSummary(principal)).resolves.toMatchObject(
      {
        data: {
          totalUsers: 1,
          activeUsers: 1,
          disabledUsers: 1,
          invitedUsers: 1,
          recentAuditEvents: 1,
        },
      },
    );

    users.findById.mockReturnValue(okAsync(null));
    await expect(
      controller.getUser(principal, "missing-id"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("surfaces repository failures to avoid silently succeeding", async () => {
    const { controller, users } = createController();
    users.listUsers.mockReturnValue(
      errAsync({ code: "repository_error", message: "database failed" }),
    );

    await expect(controller.listUsers(principal, {})).rejects.toThrow(
      "database failed",
    );
  });
});
