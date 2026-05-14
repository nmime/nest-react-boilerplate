import { describe, expect, it } from "vitest";
import { PostgresMainModule } from "./postgres.module";

describe("PostgresMainModule", () => {
  it("creates a dynamic TypeORM root module", () => {
    const dynamicModule = PostgresMainModule.forRoot({
      database: "module_test",
    });

    expect(dynamicModule.module).toBe(PostgresMainModule);
    expect(dynamicModule.imports).toHaveLength(1);
  });
});
