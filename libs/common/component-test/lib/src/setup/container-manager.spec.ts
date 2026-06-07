import { describe, expect, it, vi } from "vitest";
import { ContainerManager } from "./container-manager";

describe("ContainerManager", () => {
  it("stops all registered containers in reverse order", async () => {
    const manager = new ContainerManager();
    const stops: string[] = [];

    manager.register({
      stop: vi.fn(() => {
        stops.push("first");
      }),
    });
    manager.register({
      stop: vi.fn(() => {
        stops.push("second");
      }),
    });
    manager.register({
      stop: vi.fn(() => {
        stops.push("third");
      }),
    });

    await manager.stopAll();

    expect(stops).toEqual(["third", "second", "first"]);
  });

  it("attempts every stop and aggregates contextual failures", async () => {
    const manager = new ContainerManager();
    const stops: string[] = [];

    const firstFailure = new Error("first failed");
    const secondFailure = new Error("second failed");

    const first = manager.register({
      stop: vi.fn(() => {
        stops.push("first");
        throw firstFailure;
      }),
    });
    const second = manager.register({
      stop: vi.fn(() => {
        stops.push("second");
      }),
    });
    const third = manager.register({
      stop: vi.fn(() => {
        stops.push("third");
        return Promise.reject(secondFailure);
      }),
    });

    await expect(manager.stopAll()).rejects.toMatchObject({
      name: "AggregateError",
      message: "Failed to stop 2 of 3 managed test containers.",
      errors: [
        expect.objectContaining({
          message:
            "Failed to stop managed test container at teardown index 1/3.",
          cause: secondFailure,
          container: third,
          stopIndex: 0,
          totalContainers: 3,
        }),
        expect.objectContaining({
          message:
            "Failed to stop managed test container at teardown index 3/3.",
          cause: firstFailure,
          container: first,
          stopIndex: 2,
          totalContainers: 3,
        }),
      ],
    });
    expect(stops).toEqual(["third", "second", "first"]);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(third.stop).toHaveBeenCalledTimes(1);
  });

  it("clears registered containers after a failed teardown attempt", async () => {
    const manager = new ContainerManager();
    const stop = vi.fn(() => {
      throw new Error("stop failed");
    });

    manager.register({ stop });

    await expect(manager.stopAll()).rejects.toThrow(
      "Failed to stop 1 of 1 managed test containers.",
    );
    await manager.stopAll();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
