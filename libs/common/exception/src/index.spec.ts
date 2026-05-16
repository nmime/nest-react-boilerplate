import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  ProblemHttpException,
  createProblemDetails,
  getProblemStatus,
  toProblemDetails,
} from "./index";

describe("@app/common/exception", () => {
  it("creates RFC 7807 problem details with optional fields", () => {
    expect(
      createProblemDetails({
        title: "Forbidden",
        status: 403,
        detail: "Missing role",
        instance: "/admin/profile/me",
        type: "https://example.test/problems/forbidden",
      }),
    ).toEqual({
      type: "https://example.test/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "Missing role",
      instance: "/admin/profile/me",
    });
    expect(createProblemDetails({ title: "Bad", status: 400 })).toEqual({
      type: "about:blank",
      title: "Bad",
      status: 400,
    });
  });

  it("wraps problem details in an HttpException", () => {
    const exception = new ProblemHttpException({
      title: "Unauthorized",
      status: HttpStatus.UNAUTHORIZED,
    });

    expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(exception.getResponse()).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it("derives statuses and details from problem, Nest, and unknown errors", () => {
    const problem = new ProblemHttpException({
      title: "Conflict",
      status: 409,
    });
    const badRequest = new BadRequestException("Invalid input");
    const rawHttp = new HttpException("Nope", 418);

    expect(getProblemStatus(problem)).toBe(409);
    expect(getProblemStatus(new Error("boom"))).toBe(500);
    expect(toProblemDetails(problem)).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
    });
    expect(toProblemDetails(badRequest)).toEqual({
      type: "about:blank",
      title: "Invalid input",
      status: 400,
    });
    expect(toProblemDetails(rawHttp)).toEqual({
      type: "about:blank",
      title: "Nope",
      status: 418,
    });
    expect(toProblemDetails("boom")).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
  });
});
