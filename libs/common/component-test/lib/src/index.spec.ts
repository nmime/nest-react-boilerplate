import { describe, expect, it } from "vitest";
import * as componentTest from "./index";

describe("common component-test exports", () => {
  it("exports Postgres container helpers", () => {
    expect(componentTest.createPostgresContainer).toBeDefined();
    expect(componentTest.createPostgresContainerMikroOrmOptions).toBeDefined();
    expect(componentTest.stopPostgresContainer).toBeDefined();
  });

  it("exports generic service containers", () => {
    expect(componentTest.createRedisContainer).toBeDefined();
    expect(componentTest.createRabbitMqContainer).toBeDefined();
    expect(componentTest.createMinioContainer).toBeDefined();
  });
});
