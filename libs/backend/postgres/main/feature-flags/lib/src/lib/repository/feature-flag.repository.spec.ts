import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import { DefaultFeatureFlagTenantId } from "@app/common/feature-flags";
import { FeatureFlagEntity } from "../entity";
import {
  FeatureFlagRepository,
  resolveTenantId,
} from "./feature-flag.repository";

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve<FeatureFlagEntity | null>(null));
  const find = vi.fn(() => Promise.resolve<FeatureFlagEntity[]>([]));
  const entityManager = {
    persist,
    flush,
    findOne,
    find,
  } as unknown as EntityManager;

  return { persist, flush, findOne, find, entityManager };
}

describe("FeatureFlagRepository", () => {
  it("finds flags by tenant-scoped key", async () => {
    const flag = new FeatureFlagEntity({ key: "billing.portal", value: true });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(flag);
    const repository = new FeatureFlagRepository(entityManager);

    const result = await repository
      .findByKey("billing.portal", "00000000-0000-4000-8000-000000000001")
      .then((value) => value._unsafeUnwrap());

    expect(result).toBe(flag);
    expect(findOne).toHaveBeenCalledWith(FeatureFlagEntity, {
      key: "billing.portal",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("creates persistent DB-backed flags", async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const repository = new FeatureFlagRepository(entityManager);

    const flag = await repository
      .upsert({ key: "billing.portal", value: true, description: "Billing UI" })
      .then((value) => value._unsafeUnwrap());

    expect(flag).toMatchObject({
      tenantId: DefaultFeatureFlagTenantId,
      key: "billing.portal",
      value: true,
      description: "Billing UI",
      enabled: true,
    });
    expect(persist).toHaveBeenCalledWith(flag);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("updates existing flags without creating duplicates", async () => {
    const existing = new FeatureFlagEntity({
      key: "billing.portal",
      value: false,
      enabled: true,
    });
    const { persist, flush, findOne, entityManager } =
      createEntityManagerMock();
    findOne.mockResolvedValue(existing);
    const repository = new FeatureFlagRepository(entityManager);

    const flag = await repository
      .upsert({ key: "billing.portal", value: "on", enabled: false })
      .then((value) => value._unsafeUnwrap());

    expect(flag).toBe(existing);
    expect(flag.value).toBe("on");
    expect(flag.enabled).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("returns enabled snapshots for the resolved tenant", async () => {
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([
      new FeatureFlagEntity({ key: "billing.portal", value: true }),
      new FeatureFlagEntity({ key: "rollout.percent", value: 25 }),
    ]);
    const repository = new FeatureFlagRepository(entityManager);

    const snapshot = await repository
      .getSnapshot({ tenantId: "00000000-0000-4000-8000-000000000001" })
      .then((value) => value._unsafeUnwrap());

    expect(snapshot).toEqual({
      source: "postgres",
      values: { "billing.portal": true, "rollout.percent": 25 },
    });
    expect(find).toHaveBeenCalledWith(
      FeatureFlagEntity,
      {
        enabled: true,
        tenantId: "00000000-0000-4000-8000-000000000001",
      },
      { orderBy: { key: "ASC" } },
    );
  });

  it("maps repository errors and default tenant resolution", async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue(new Error("db unavailable"));
    const repository = new FeatureFlagRepository(entityManager);

    const result = await repository.findByKey("billing.portal");

    expect(resolveTenantId()).toBe(DefaultFeatureFlagTenantId);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "db unavailable",
    });
  });
});
