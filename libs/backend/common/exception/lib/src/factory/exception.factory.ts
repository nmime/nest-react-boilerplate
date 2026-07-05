import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../abstract/base.exception";

export const Exception = {
  badRequest: (detail?: string, code = "bad-request") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.BAD_REQUEST,
      title: "Bad Request",
    }),
  conflict: (detail?: string, code = "conflict") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    }),
  forbidden: (detail?: string, code = "forbidden") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.FORBIDDEN,
      title: "Forbidden",
    }),
  notFound: (detail?: string, code = "not-found") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.NOT_FOUND,
      title: "Not Found",
    }),
  unauthorized: (detail?: string, code = "unauthorized") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.UNAUTHORIZED,
      title: "Unauthorized",
    }),
};
