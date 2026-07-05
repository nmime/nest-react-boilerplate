import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BaseException } from "../abstract/base.exception";
import { AppHttpException } from "../app-http.exception";
import { Exception } from "../factory/exception.factory";
import { createProblemDetails } from "./create-problem-details.util";
import { getProblemStatus, toProblemDetails } from "./to-problem-details.util";

describe("getProblemStatus / toProblemDetails", () => {
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
