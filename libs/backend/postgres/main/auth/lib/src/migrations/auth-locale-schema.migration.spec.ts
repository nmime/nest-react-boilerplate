import { describe, expect, it } from "vitest";
import { authMigrations } from "../infrastructure/data-access/migrations";

describe("legacy auth migration spec location", () => {
  it("points migration checks at the data-access adapter boundary", () => {
    expect(authMigrations.length).toBeGreaterThan(0);
  });
});
