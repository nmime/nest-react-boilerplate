import { describe, expect, it } from "vitest";
import { AuthUserRepository } from "../infrastructure/data-access/repositories";

describe("legacy auth repository component spec location", () => {
  it("points component coverage at the data-access adapter boundary", () => {
    expect(AuthUserRepository).toBeDefined();
  });
});
