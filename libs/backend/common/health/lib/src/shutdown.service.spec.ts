import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShutdownService } from "./shutdown.service";

describe("ShutdownService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a plain shutdown message when no signal is provided", () => {
    const logSpy = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);

    new ShutdownService().onApplicationShutdown();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Application shutdown");
  });

  it("appends the signal to the shutdown message when one is provided", () => {
    const logSpy = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);

    new ShutdownService().onApplicationShutdown("SIGTERM");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Application shutdown: SIGTERM");
  });
});
