import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createProblemDetails } from "./create-problem-details.util";

describe("createProblemDetails", () => {
  it("creates RFC 9457 problem details with optional fields", () => {
    expect(
      createProblemDetails({
        title: "Forbidden",
        status: 403,
        detail: "Missing role",
        instance: "urn:problem-instance:test:admin-profile-me",
        type: "urn:problem:test:forbidden",
      }),
    ).toEqual({
      type: "urn:problem:test:forbidden",
      title: "Forbidden",
      status: 403,
      detail: "Missing role",
      instance: "urn:problem-instance:test:admin-profile-me",
    });
    expect(createProblemDetails({ title: "Bad", status: 400 })).toEqual({
      type: "about:blank",
      title: "Bad",
      status: 400,
    });
  });

  it("omits raw request paths from problem instance", () => {
    expect(
      createProblemDetails({
        title: "Not Found",
        status: HttpStatus.NOT_FOUND,
        instance: "/",
      }),
    ).not.toHaveProperty("instance");
    expect(
      createProblemDetails({
        title: "Not Found",
        status: HttpStatus.NOT_FOUND,
        instance: "/missing",
      }),
    ).not.toHaveProperty("instance");
  });

  it("keeps RFC standard problem members when extensions contain reserved keys", () => {
    expect(
      createProblemDetails({
        type: "urn:problem:test:conflict",
        title: "Conflict",
        status: 409,
        detail: "Canonical detail",
        instance: "urn:problem-instance:test:canonical",
        code: "conflict",
        extensions: {
          type: "urn:problem:test:wrong",
          title: "Wrong",
          status: 418,
          detail: "Wrong detail",
          instance: "urn:problem-instance:test:wrong",
          code: "wrong",
          resource: "user",
        },
      }),
    ).toEqual({
      type: "urn:problem:test:conflict",
      title: "Conflict",
      status: 409,
      detail: "Canonical detail",
      instance: "urn:problem-instance:test:canonical",
      code: "conflict",
      resource: "user",
    });
  });
});
