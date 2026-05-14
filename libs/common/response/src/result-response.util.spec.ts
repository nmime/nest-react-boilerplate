import { err, ok } from "neverthrow";
import { describe, expect, it } from "vitest";
import {
  createOkResponse,
  createProblemResponse,
  mapResultToResponse,
} from "./index";

describe("response helpers", () => {
  it("wraps successful data", () => {
    expect(createOkResponse({ status: "ok" })).toEqual({
      data: { status: "ok" },
    });
  });

  it("wraps problem details", () => {
    expect(createProblemResponse("bad_request", "Invalid input")).toEqual({
      error: { code: "bad_request", message: "Invalid input" },
    });
  });

  it("maps neverthrow results to API responses", () => {
    expect(mapResultToResponse(ok("ready"))).toEqual({ data: "ready" });
    expect(
      mapResultToResponse(err({ code: "disabled", message: "OAuth disabled" })),
    ).toEqual({ error: { code: "disabled", message: "OAuth disabled" } });
  });
});
