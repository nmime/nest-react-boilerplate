import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BaseException } from "./base.exception";

describe("BaseException", () => {
  it("creates coded problem details and reusable base exceptions", () => {
    const cause = new Error("root cause");
    const exception = new BaseException({
      cause,
      code: "domain-conflict",
      detail: "Already exists",
      extensions: { resource: "user" },
      instance: "urn:problem-instance:test:users:1",
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    });

    expect(exception).toMatchObject({
      cause,
      code: "domain-conflict",
      detail: "Already exists",
      name: "BaseException",
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    });
    expect(exception.toProblemDetails("/fallback")).toEqual({
      type: "urn:problem:nest-react-boilerplate:domain-conflict",
      title: "Conflict",
      status: HttpStatus.CONFLICT,
      detail: "Already exists",
      instance: "urn:problem-instance:test:users:1",
      code: "domain-conflict",
      resource: "user",
    });
    expect(
      new BaseException({
        status: HttpStatus.BAD_REQUEST,
        title: "Bad Request",
      }).toProblemDetails("/fallback"),
    ).not.toHaveProperty("instance");
  });
});
