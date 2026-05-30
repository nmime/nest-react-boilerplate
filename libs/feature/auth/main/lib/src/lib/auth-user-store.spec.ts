import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
  toAuthUserRecord,
  type AuthUserRecord,
} from "./auth-user-store";

const record: AuthUserRecord = {
  id: "user-id",
  email: "user@example.com",
  displayName: null,
  passwordHash: "hash",
  roles: ["user"],
  permissions: ["profile:read"],
  locale: null,
  theme: "system",
  status: "active",
  lastLoginAt: null,
};

describe("auth user stores", () => {
  it("maps Postgres repository records and null lookups", async () => {
    const repository = {
      createUser: vi.fn(() => okAsync(record)),
      findByEmail: vi.fn((email: string) =>
        okAsync(email === record.email ? record : null),
      ),
      findById: vi.fn((id: string) =>
        okAsync(id === record.id ? record : null),
      ),
      setLocale: vi.fn((id: string, locale: "en" | "ru") =>
        okAsync(id === record.id ? { ...record, locale } : null),
      ),
      setPreferences: vi.fn(
        (
          id: string,
          preferences: {
            locale?: "en" | "ru";
            theme?: "system" | "light" | "dark";
          },
        ) => okAsync(id === record.id ? { ...record, ...preferences } : null),
      ),
      recordLogin: vi.fn((id: string, loggedInAt?: Date) =>
        okAsync(
          id === record.id
            ? { ...record, lastLoginAt: loggedInAt ?? null }
            : null,
        ),
      ),
    };
    const store = new PostgresAuthUserStore(repository as never);
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");

    expect((await store.create(record))._unsafeUnwrap()).toEqual(record);
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toEqual(
      record,
    );
    expect(
      (await store.findByEmail("missing@example.com"))._unsafeUnwrap(),
    ).toBeNull();
    expect((await store.findById(record.id))._unsafeUnwrap()).toEqual(record);
    expect((await store.findById("missing"))._unsafeUnwrap()).toBeNull();
    expect(
      (await store.setLocale(record.id, "ru"))._unsafeUnwrap(),
    ).toMatchObject({ locale: "ru" });
    expect((await store.setLocale("missing", "ru"))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await store.setPreferences(record.id, { locale: "en", theme: "dark" })
      )._unsafeUnwrap(),
    ).toMatchObject({ locale: "en", theme: "dark" });
    expect(
      (await store.recordLogin(record.id, loggedInAt))._unsafeUnwrap(),
    ).toMatchObject({ lastLoginAt: loggedInAt });
    expect((await store.recordLogin("missing"))._unsafeUnwrap()).toBeNull();
  });

  it("passes repository errors through Postgres store methods", async () => {
    const error = { code: "repository_error" as const, message: "boom" };
    const repository = {
      createUser: vi.fn(() => errAsync(error)),
      findByEmail: vi.fn(() => errAsync(error)),
      findById: vi.fn(() => errAsync(error)),
      setLocale: vi.fn(() => errAsync(error)),
      setPreferences: vi.fn(() => errAsync(error)),
      recordLogin: vi.fn(() => errAsync(error)),
    };
    const store = new PostgresAuthUserStore(repository as never);

    expect((await store.create(record))._unsafeUnwrapErr()).toEqual(error);
    expect((await store.findByEmail(record.email))._unsafeUnwrapErr()).toEqual(
      error,
    );
    expect((await store.findById(record.id))._unsafeUnwrapErr()).toEqual(error);
    expect((await store.setLocale(record.id, "ru"))._unsafeUnwrapErr()).toEqual(
      error,
    );
    expect(
      (
        await store.setPreferences(record.id, { theme: "light" })
      )._unsafeUnwrapErr(),
    ).toEqual(error);
    expect((await store.recordLogin(record.id))._unsafeUnwrapErr()).toEqual(
      error,
    );
  });

  it("stores in-memory users, rejects duplicates, and handles missing logins", async () => {
    const store = new InMemoryAuthUserStore();
    const created = (await store.create(record))._unsafeUnwrap();
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");

    uiTheme: record.theme;
    expect(created).toMatchObject({
      email: record.email,
      displayName: null,
      roles: ["user"],
      status: "active",
      locale: null,
      lastLoginAt: null,
    });
    expect((await store.create(record))._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "Email already exists.",
    });
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toEqual(
      created,
    );
    (
      store as unknown as { usersById: Map<string, AuthUserRecord> }
    ).usersById.delete(created.id);
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toBeNull();
    (
      store as unknown as { usersById: Map<string, AuthUserRecord> }
    ).usersById.set(created.id, created);
    expect(
      (await store.findByEmail("missing@example.com"))._unsafeUnwrap(),
    ).toBeNull();
    expect((await store.findById(created.id))._unsafeUnwrap()).toEqual(created);
    expect((await store.findById("missing"))._unsafeUnwrap()).toBeNull();
    expect(
      (await store.setLocale(created.id, "ru"))._unsafeUnwrap(),
    ).toMatchObject({ locale: "ru" });
    expect((await store.setLocale("missing", "ru"))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await store.setPreferences(created.id, { theme: "dark" })
      )._unsafeUnwrap(),
    ).toMatchObject({ theme: "dark" });
    expect(
      (await store.recordLogin(created.id, loggedInAt))._unsafeUnwrap(),
    ).toMatchObject({ lastLoginAt: loggedInAt });
    expect((await store.recordLogin("missing"))._unsafeUnwrap()).toBeNull();
  });

  it("maps repository entities to auth user records", () => {
    expect(toAuthUserRecord(record)).toEqual(record);
  });
});
