import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ApiExceptions } from "./api-exceptions.decorator";

describe("ApiExceptions", () => {
  it("builds a decorator from individual status codes", () => {
    expect(ApiExceptions(HttpStatus.BAD_REQUEST, 599)).toEqual(
      expect.any(Function),
    );
  });

  it("flattens arrays of status codes into a single decorator", () => {
    expect(
      ApiExceptions([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED]),
    ).toEqual(expect.any(Function));
  });
});
