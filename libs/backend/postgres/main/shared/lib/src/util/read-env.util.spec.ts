import { describe, expect, it, vi } from "vitest";
import {
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from "./read-env.util";

// vitest hoists this mock above the import above; the factory throws a
// non-Error to drive the `throw error` rethrow path in each parser.
vi.mock("@app/common-config", () => ({
  createConfig: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- simulating a non-Error value thrown by config parsing
    throw "non-error-config-failure";
  },
}));

describe("read-env parsers rethrow non-Error failures verbatim", () => {
  it("rethrows non-Error values raised while parsing a boolean", () => {
    expect.assertions(1);
    try {
      readBoolean("1");
    } catch (error) {
      expect(error).toBe("non-error-config-failure");
    }
  });

  it("rethrows non-Error values raised while parsing a port", () => {
    expect.assertions(1);
    try {
      readPort("5432");
    } catch (error) {
      expect(error).toBe("non-error-config-failure");
    }
  });

  it("rethrows non-Error values raised while parsing SSL rejectUnauthorized", () => {
    expect.assertions(1);
    try {
      readSslRejectUnauthorized({ POSTGRES_SSL_REJECT_UNAUTHORIZED: "true" });
    } catch (error) {
      expect(error).toBe("non-error-config-failure");
    }
  });
});
