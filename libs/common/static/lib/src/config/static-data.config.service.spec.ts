import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaticDataConfigService } from "./static-data.config.service";

describe("StaticDataConfigService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses an explicit root before the environment", () => {
    vi.stubEnv("STATIC_DATA_ROOT", "/env/static");

    expect(new StaticDataConfigService("/configured/static").dataRoot).toBe(
      "/configured/static",
    );
  });

  it("reads default and environment roots through createConfig", () => {
    expect(new StaticDataConfigService().dataRoot).toBe(".");

    vi.stubEnv("STATIC_DATA_ROOT", "/env/static");

    expect(new StaticDataConfigService().dataRoot).toBe("/env/static");
  });
});
