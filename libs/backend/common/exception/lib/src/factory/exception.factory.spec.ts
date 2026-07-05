import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { Exception } from "./exception.factory";

describe("Exception factory", () => {
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
});
