import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AppHttpException } from "./app-http.exception";

describe("AppHttpException", () => {
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
});
