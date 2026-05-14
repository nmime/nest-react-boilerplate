import { describe, expect, it } from "vitest";
import * as postgresMain from "./index";

describe("postgres main exports", () => {
  it("exports public helpers", () => {
    expect(postgresMain.PostgresMainModule).toBeDefined();
    expect(postgresMain.createPostgresDataSourceOptions).toBeDefined();
    expect(postgresMain.runInPostgresTransaction).toBeDefined();
  });
});
