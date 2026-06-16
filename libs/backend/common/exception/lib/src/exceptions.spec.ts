import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ApiExceptions,
  BaseException,
  Exception,
  AppHttpException,
  createProblemDetails,
  getProblemStatus,
  localizeProblemDetails,
  mapHttpStatusToProblemTitle,
  toProblemDetails,
  getProblemDetailsSchema,
} from "./index";

describe("@app/common/exception", () => {
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

  it("wraps problem details in an HttpException", () => {
    const exception = new AppHttpException({
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
    const problem = new AppHttpException({
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
    expect(ApiExceptions(HttpStatus.BAD_REQUEST, 599)).toEqual(
      expect.any(Function),
    );
    expect(
      ApiExceptions([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED]),
    ).toEqual(expect.any(Function));

    // Test getProblemDetailsSchema for 400 Bad Request
    const schema400 = getProblemDetailsSchema(HttpStatus.BAD_REQUEST);
    expect(schema400.properties?.status?.example).toBe(400);
    expect(schema400.properties?.title?.example).toBe("Bad Request");
    expect(schema400.properties?.errors).toBeDefined();

    // Test getProblemDetailsSchema for 401 Unauthorized
    const schema401 = getProblemDetailsSchema(HttpStatus.UNAUTHORIZED);
    expect(schema401.properties?.status?.example).toBe(401);
    expect(schema401.properties?.title?.example).toBe("Unauthorized");
    expect(schema401.properties?.errors).toBeUndefined();
  });

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
    const problem = new AppHttpException({
      instance: "/existing",
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      title: "Invalid",
    });
    const problemWithoutInstance = new AppHttpException({
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    });
    const patchedProblem = new AppHttpException({
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
      status: HttpStatus.FORBIDDEN,
    });
    expect(toProblemDetails(base, "/base")).not.toHaveProperty("instance");
    expect(toProblemDetails(problem, "/fallback")).toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(toProblemDetails(problem, "/fallback")).not.toHaveProperty(
      "instance",
    );
    expect(toProblemDetails(problemWithoutInstance, "/problem")).toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(
      toProblemDetails(problemWithoutInstance, "/problem"),
    ).not.toHaveProperty("instance");
    expect(toProblemDetails(patchedProblem, "/patched")).toEqual({
      code: "bad-request",
      detail: "The request could not be processed.",
      type: "urn:problem:nest-react-boilerplate:bad-request",
      title: "Bad Request",
      status: HttpStatus.BAD_REQUEST,
    });
    expect(toProblemDetails(genericProblem, "/generic")).toMatchObject({
      status: 409,
      title: "Conflict",
    });
    expect(toProblemDetails(genericProblem, "/generic")).not.toHaveProperty(
      "instance",
    );
    expect(
      toProblemDetails(genericProblemWithInstance, "/generic-fallback"),
    ).toMatchObject({
      status: 409,
      title: "Conflict",
    });
    expect(
      toProblemDetails(genericProblemWithInstance, "/generic-fallback"),
    ).not.toHaveProperty("instance");
  });

  it("localizes validation issues and preserves unmapped problem fields", () => {
    expect(
      localizeProblemDetails(
        {
          type: "about:blank",
          title: "Bad Request",
          status: HttpStatus.BAD_REQUEST,
          errors: [
            {
              property: "email",
              detail: "email must be an email address",
              message: "email must be an email address",
              constraints: {
                isEmail: "email must be an email address",
                custom: "custom",
              },
            },
            { constraints: { minLength: "short" } },
            "plain",
          ],
        },
        "ru",
      ),
    ).toMatchObject({
      code: "bad-request",
      errors: [
        {
          property: "email",
          constraints: {
            isEmail: "Поле email должно быть действительным email-адресом",
            custom: "custom",
          },
          detail: "Поле email должно быть действительным email-адресом",
          message: "Поле email должно быть действительным email-адресом",
        },
        { constraints: { minLength: "Поле value слишком короткое" } },
        "plain",
      ],
      type: "urn:problem:nest-react-boilerplate:bad-request",
    });
    expect(
      localizeProblemDetails({
        type: "urn:custom",
        title: "Custom",
        status: 499,
        code: "unmapped",
        detail: "No translation",
        errors: "raw",
      }),
    ).toEqual({
      type: "urn:custom",
      title: "Custom",
      status: 499,
      code: "unmapped",
      detail: "No translation",
      errors: "raw",
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
        "ru",
      ),
    ).toMatchObject({
      code: "forbidden",
      detail: "Required role is missing.",
      localizedDetail: "Отсутствует необходимая роль.",
      status: HttpStatus.FORBIDDEN,
      title: "Forbidden",
      type: "urn:problem:nest-react-boilerplate:forbidden",
    });
  });
});
