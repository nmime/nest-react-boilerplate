import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ApiProblemExceptions,
  BaseException,
  Exception,
  ProblemHttpException,
  createProblemDetails,
  getProblemStatus,
  mapHttpStatusToProblemTitle,
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
        type: "urn:problem:test:forbidden",
      }),
    ).toEqual({
      type: "urn:problem:test:forbidden",
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
      code: "conflict",
      detail: "The request conflicts with current state.",
      type: "urn:problem:nest-react-boilerplate:conflict",
      title: "Conflict",
      status: 409,
    });
    expect(toProblemDetails(badRequest)).toEqual({
      code: "bad-request",
      detail: "The request could not be processed.",
      type: "urn:problem:nest-react-boilerplate:bad-request",
      title: "Bad Request",
      status: 400,
    });
    expect(toProblemDetails(rawHttp)).toEqual({
      code: "i-am-a-teapot",
      detail: "Nope",
      type: "urn:problem:nest-react-boilerplate:i-am-a-teapot",
      title: "I Am A Teapot",
      status: 418,
    });
    expect(toProblemDetails("boom")).toEqual({
      code: "internal-server-error",
      detail: "An unexpected error occurred.",
      type: "urn:problem:nest-react-boilerplate:internal-server-error",
      title: "Internal Server Error",
      status: 500,
    });
  });

  it("maps status titles and exposes OpenAPI problem decorators", () => {
    expect(mapHttpStatusToProblemTitle(HttpStatus.BAD_REQUEST)).toBe(
      "Bad Request",
    );
    expect(mapHttpStatusToProblemTitle(599)).toBe("Unexpected Error");
    expect(ApiProblemExceptions(HttpStatus.BAD_REQUEST, 599)).toEqual(
      expect.any(Function),
    );
  });

  it("creates coded problem details and reusable base exceptions", () => {
    const cause = new Error("root cause");
    const exception = new BaseException({
      cause,
      code: "domain-conflict",
      detail: "Already exists",
      extensions: { resource: "user" },
      instance: "/users/1",
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
      instance: "/users/1",
      code: "domain-conflict",
      resource: "user",
    });
    expect(
      new BaseException({
        status: HttpStatus.BAD_REQUEST,
        title: "Bad Request",
      }).toProblemDetails("/fallback"),
    ).toMatchObject({ instance: "/fallback", status: 400 });
  });

  it("creates standard domain exceptions", () => {
    expect(Exception.badRequest("bad").toProblemDetails()).toMatchObject({
      code: "bad-request",
      detail: "bad",
      status: HttpStatus.BAD_REQUEST,
      title: "Bad Request",
    });
    expect(Exception.conflict().status).toBe(HttpStatus.CONFLICT);
    expect(Exception.forbidden().status).toBe(HttpStatus.FORBIDDEN);
    expect(Exception.notFound().status).toBe(HttpStatus.NOT_FOUND);
    expect(Exception.unauthorized().status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it("normalizes base, problem, and generic HTTP exceptions", () => {
    const base = new BaseException({
      code: "forbidden",
      status: HttpStatus.FORBIDDEN,
      title: "Forbidden",
    });
    const problem = new ProblemHttpException({
      instance: "/existing",
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      title: "Invalid",
    });
    const problemWithoutInstance = new ProblemHttpException({
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    });
    const patchedProblem = new ProblemHttpException({
      status: HttpStatus.BAD_REQUEST,
      title: "Bad Request",
    });
    vi.spyOn(patchedProblem, "getResponse").mockReturnValue("bad request");
    const genericProblem = new HttpException(
      createProblemDetails({ status: 409, title: "Conflict" }),
      409,
    );
    const genericProblemWithInstance = new HttpException(
      createProblemDetails({
        instance: "/existing-generic",
        status: 409,
        title: "Conflict",
      }),
      409,
    );

    expect(getProblemStatus(base)).toBe(HttpStatus.FORBIDDEN);
    expect(getProblemStatus(new HttpException("Accepted", 202))).toBe(202);
    expect(toProblemDetails(base, "/base")).toMatchObject({
      code: "forbidden",
      instance: "/base",
      status: HttpStatus.FORBIDDEN,
    });
    expect(toProblemDetails(problem, "/fallback")).toMatchObject({
      instance: "/existing",
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(toProblemDetails(problemWithoutInstance, "/problem")).toMatchObject({
      instance: "/problem",
      status: HttpStatus.CONFLICT,
    });
    expect(toProblemDetails(patchedProblem, "/patched")).toEqual({
      code: "bad-request",
      detail: "The request could not be processed.",
      type: "urn:problem:nest-react-boilerplate:bad-request",
      title: "Bad Request",
      status: HttpStatus.BAD_REQUEST,
      instance: "/patched",
    });
    expect(toProblemDetails(genericProblem, "/generic")).toMatchObject({
      instance: "/generic",
      status: 409,
      title: "Conflict",
    });
    expect(
      toProblemDetails(genericProblemWithInstance, "/generic-fallback"),
    ).toMatchObject({
      instance: "/existing-generic",
      status: 409,
      title: "Conflict",
    });
  });

  it("uses HTTP response messages and status fallbacks for titles", () => {
    expect(
      toProblemDetails(new BadRequestException(["name", "email"])),
    ).toEqual({
      code: "bad-request",
      detail: "The request could not be processed.",
      type: "urn:problem:nest-react-boilerplate:bad-request",
      title: "Bad Request",
      status: 400,
    });
    expect(
      toProblemDetails(new HttpException({ message: "single message" }, 422)),
    ).toEqual({
      code: "unprocessable-entity",
      detail: "single message",
      type: "urn:problem:nest-react-boilerplate:unprocessable-entity",
      title: "Unprocessable Entity",
      status: 422,
    });
    expect(
      toProblemDetails(new HttpException("", HttpStatus.I_AM_A_TEAPOT)),
    ).toEqual({
      code: "i-am-a-teapot",
      type: "urn:problem:nest-react-boilerplate:i-am-a-teapot",
      title: "I Am A Teapot",
      status: HttpStatus.I_AM_A_TEAPOT,
    });
    expect(
      toProblemDetails(
        Exception.forbidden("Required role is missing."),
        undefined,
        "es",
      ),
    ).toMatchObject({
      code: "forbidden",
      detail: "Falta el rol requerido.",
      status: HttpStatus.FORBIDDEN,
      title: "Prohibido",
      type: "urn:problem:nest-react-boilerplate:forbidden",
    });
  });
});
