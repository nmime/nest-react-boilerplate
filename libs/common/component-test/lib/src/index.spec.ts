import { describe, expect, it } from "vitest";
import * as componentTest from "./index";

describe("common component-test exports", () => {
  it("exports Postgres container helpers", () => {
    expect(componentTest.createPostgresContainer).toBeDefined();
    expect(componentTest.createPostgresContainerMikroOrmOptions).toBeDefined();
    expect(componentTest.stopPostgresContainer).toBeDefined();
    expect(componentTest.hasDockerRuntime).toBeDefined();
    expect(componentTest.shouldSkipDockerTest).toBeDefined();
    expect(componentTest.DockerUnavailableGuardPattern).toBe(
      "const dockerIt = it.skipIf(shouldSkipDockerTest());",
    );
  });

  it("exports generic service containers", () => {
    expect(componentTest.createRedisContainer).toBeDefined();
    expect(componentTest.createNatsContainer).toBeDefined();
    expect(componentTest.createMinioContainer).toBeDefined();
  });

  it("does not export removed queue container helpers", () => {
    const removedCreateHelper = ["create", "Rabbit", "Mq", "Container"].join(
      "",
    );
    const removedImageConstant = ["Default", "Rabbit", "Mq", "TestImage"].join(
      "",
    );

    expect(
      (componentTest as Record<string, unknown>)[removedCreateHelper],
    ).toBeUndefined();
    expect(
      (componentTest as Record<string, unknown>)[removedImageConstant],
    ).toBeUndefined();
  });
});
