import { describe, expect, it } from "vitest";
import { PostgresMainModule } from "./postgres.module";

describe("PostgresMainModule", () => {
  it("creates a dynamic MikroORM root module", async () => {
    const dynamicModule = PostgresMainModule.forRoot({
      dbName: "module_test",
    });

    expect(dynamicModule.module).toBe(PostgresMainModule);
    expect(dynamicModule.imports).toHaveLength(1);
    await expect(dynamicModule.imports?.[0]).resolves.toMatchObject({
      module: expect.any(Function) as unknown,
    });
  });
});
