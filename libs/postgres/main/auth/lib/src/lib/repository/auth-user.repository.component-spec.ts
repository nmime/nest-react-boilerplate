import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from "@app/common-component-test";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthPostgresModule } from "../auth-postgres.module";
import {
  AdminAuditLogEntity,
  AdminAuditLogEntitySchema,
  AuthUserEntity,
  AuthUserEntitySchema,
  TransactionalOutboxEventEntity,
  TransactionalOutboxEventEntitySchema,
} from "../entity";
import { AuthUserRepository } from "./auth-user.repository";
import { AdminUserMutationRepository } from "./admin-user-mutation.repository";

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write(
    "AuthUserRepository component tests: skipped because Docker is not available on this host.\n",
  );
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker("AuthUserRepository component", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let moduleRef: TestingModule | undefined;
  let app: INestApplication | undefined;
  let orm: MikroORM;
  let authUsers: AuthUserRepository;
  let adminUserMutations: AdminUserMutationRepository;

  beforeAll(async () => {
    container = await startPostgresContainer();

    moduleRef = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot(
          createPostgresContainerMikroOrmOptions(container, [
            AdminAuditLogEntitySchema,
            AuthUserEntitySchema,
            TransactionalOutboxEventEntitySchema,
          ]),
        ),
        AuthPostgresModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    orm = moduleRef.get(MikroORM);
    await orm.schema.refresh();
    authUsers = moduleRef.get(AuthUserRepository);
    adminUserMutations = moduleRef.get(AdminUserMutationRepository);
  });

  afterEach(async () => {
    await orm.em.nativeDelete(TransactionalOutboxEventEntity, {});
    await orm.em.nativeDelete(AdminAuditLogEntity, {});
    await orm.em.nativeDelete(AuthUserEntity, {});
    orm.em.clear();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopPostgresContainer(container);
  });

  it("creates and finds users through a real Postgres repository", async () => {
    const created = await authUsers.createUser({
      email: "user@example.com",
      displayName: "Component User",
      permissions: ["profile:read"],
      roles: ["user"],
    });

    const user = created._unsafeUnwrap();
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(user.email).toBe("user@example.com");
    expect(user.roles).toEqual(["user"]);
    expect(user.permissions).toEqual(["profile:read"]);

    const found = await authUsers.findByEmail("user@example.com");
    expect(found._unsafeUnwrap()).toMatchObject({
      id: user.id,
      email: "user@example.com",
      displayName: "Component User",
      permissions: ["profile:read"],
      roles: ["user"],
      status: "active",
    });
  });

  it("updates access policy and records logins", async () => {
    const user = (
      await authUsers.createUser({ email: "admin@example.com" })
    )._unsafeUnwrap();
    const policy = await authUsers.setAccessPolicy(user.id, {
      permissions: ["admin:read"],
      roles: ["admin"],
      status: "disabled",
    });
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");
    const login = await authUsers.recordLogin(user.id, loggedInAt);

    expect(policy._unsafeUnwrap()).toMatchObject({
      permissions: ["admin:read"],
      roles: ["admin"],
      status: "disabled",
    });
    expect(login._unsafeUnwrap()?.lastLoginAt?.toISOString()).toBe(
      loggedInAt.toISOString(),
    );
  });

  it("returns null for missing users", async () => {
    const found = await authUsers.findByEmail("missing@example.com");

    expect(found._unsafeUnwrap()).toBeNull();
    expect(
      (
        await authUsers.findById("00000000-0000-4000-8000-000000000000")
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.setAccessPolicy(
          "00000000-0000-4000-8000-000000000000",
          {},
        )
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.recordLogin("00000000-0000-4000-8000-000000000000")
      )._unsafeUnwrap(),
    ).toBeNull();
  });

  it("maps real unique-constraint failures to repository errors", async () => {
    await authUsers
      .createUser({ email: "duplicate@example.com" })
      .mapErr((error) => {
        throw new Error(error.message);
      });

    const duplicate = await authUsers.createUser({
      email: "duplicate@example.com",
    });

    expect(duplicate._unsafeUnwrapErr().code).toBe("repository_error");
  });

  it("atomically writes sensitive admin mutations with audit and outbox rows", async () => {
    const user = (
      await authUsers.createUser({
        email: "powerful-admin@example.com",
        roles: ["admin"],
        permissions: ["admin:users:write", "admin:users:access-policy:update"],
      })
    )._unsafeUnwrap();
    const actor = (
      await authUsers.createUser({
        email: "second-powerful-admin@example.com",
        roles: ["admin"],
        permissions: ["admin:users:write", "admin:users:access-policy:update"],
      })
    )._unsafeUnwrap();

    const mutation = await adminUserMutations.mutateAccessPolicyWithAudit({
      targetUserId: user.id,
      actorUserId: actor.id,
      action: "admin.user.status.update",
      policy: { status: "disabled" },
      audit: { metadata: { requestId: "req-component" } },
    });

    expect(mutation._unsafeUnwrap()).toMatchObject({
      before: { status: "active" },
      after: { status: "disabled" },
      auditLog: {
        action: "admin.user.status.update",
        before: { status: "active" },
        after: { status: "disabled" },
      },
      outboxEvent: {
        aggregateType: "admin.user",
        aggregateId: user.id,
        eventType: "admin.user.status.update",
        status: "pending",
      },
    });
    expect(await orm.em.count(AdminAuditLogEntity, {})).toBe(1);
    expect(await orm.em.count(TransactionalOutboxEventEntity, {})).toBe(1);
  });

  it("blocks last powerful admin changes when another active admin lacks required permissions", async () => {
    const onlyPowerfulAdmin = (
      await authUsers.createUser({
        email: "only-powerful-admin@example.com",
        roles: ["admin"],
        permissions: ["admin:users:write", "admin:users:access-policy:update"],
      })
    )._unsafeUnwrap();
    await authUsers.createUser({
      email: "role-only-admin@example.com",
      roles: ["admin"],
      permissions: ["admin:users:read"],
    });

    const mutation = await adminUserMutations.mutateAccessPolicyWithAudit({
      targetUserId: onlyPowerfulAdmin.id,
      actorUserId: "00000000-0000-4000-8000-000000000099",
      action: "admin.user.access_policy.update",
      policy: {
        roles: ["admin"],
        permissions: ["admin:users:write"],
      },
      audit: { metadata: { requestId: "req-component" } },
    });

    expect(mutation._unsafeUnwrapErr().message).toBe(
      "At least one active administrator must retain admin write access.",
    );
    expect(await orm.em.count(AdminAuditLogEntity, {})).toBe(0);
    expect(await orm.em.count(TransactionalOutboxEventEntity, {})).toBe(0);
  });
});
