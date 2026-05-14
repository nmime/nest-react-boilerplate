import { describe, expect, it } from "vitest";
import * as componentTest from "./index";

describe("common component-test exports", () => {
  it("exports Postgres container helpers", () => {
    expect(componentTest.createPostgresContainer).toBeDefined();
    expect(componentTest.createPostgresContainerTypeOrmOptions).toBeDefined();
    expect(componentTest.stopPostgresContainer).toBeDefined();
  });
});
