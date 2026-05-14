import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  createPostgresContainerMikroOrmOptions,
  startPostgresContainer,
  stopPostgresContainer,
} from "@app/common-component-test";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthPostgresModule } from "../auth-postgres.module";
import { AuthUserEntity, AuthUserEntitySchema } from "../entity";
import { AuthUserRepository } from "./auth-user.repository";

describe("AuthUserRepository component", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let moduleRef: TestingModule | undefined;
  let app: INestApplication | undefined;
  let orm: MikroORM;
  let authUsers: AuthUserRepository;

  beforeAll(async () => {
    container = await startPostgresContainer();

    moduleRef = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot(
          createPostgresContainerMikroOrmOptions(container, [
            AuthUserEntitySchema,
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
  });

  afterEach(async () => {
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
    });

    const user = created._unsafeUnwrap();
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(user.email).toBe("user@example.com");

    const found = await authUsers.findByEmail("user@example.com");
    expect(found._unsafeUnwrap()).toMatchObject({
      id: user.id,
      email: "user@example.com",
      displayName: "Component User",
    });
  });

  it("returns null for missing users", async () => {
    const found = await authUsers.findByEmail("missing@example.com");

    expect(found._unsafeUnwrap()).toBeNull();
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
});
