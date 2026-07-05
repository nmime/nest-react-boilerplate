import { describe, expect, it } from "vitest";
import type { ProblemDetails } from "@app/backend-common-exception";
import { formatProblemDescriptor } from "./problem-descriptor.util";

const problem = (overrides: Partial<ProblemDetails>): ProblemDetails => ({
  status: 500,
  title: "Internal Server Error",
  type: "about:blank",
  ...overrides,
});

describe("formatProblemDescriptor", () => {
  it("appends code and instance segments when both are present", () => {
    expect(
      formatProblemDescriptor(
        problem({
          code: "engine-failure",
          instance: "urn:instance:req-42",
          status: 409,
          title: "Conflict",
        }),
      ),
    ).toBe("409 Conflict code=engine-failure instance=urn:instance:req-42");
  });

  it("keeps the instance segment while dropping an absent code", () => {
    expect(
      formatProblemDescriptor(
        problem({
          instance: "urn:instance:req-7",
          status: 404,
          title: "Not Found",
        }),
      ),
    ).toBe("404 Not Found instance=urn:instance:req-7");
  });

  it("keeps the code segment while dropping an absent instance", () => {
    expect(
      formatProblemDescriptor(
        problem({ code: "bad-request", status: 400, title: "Bad Request" }),
      ),
    ).toBe("400 Bad Request code=bad-request");
  });

  it("emits only the status and title when code and instance are absent", () => {
    expect(formatProblemDescriptor(problem({}))).toBe(
      "500 Internal Server Error",
    );
  });
});
