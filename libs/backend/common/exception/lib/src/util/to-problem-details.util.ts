import { HttpException, HttpStatus } from "@nestjs/common";
import { BaseException } from "../abstract/base.exception";
import { AppHttpException } from "../app-http.exception";
import type { ProblemDetails } from "../type/problem-details.type";
import { createProblemDetails } from "./create-problem-details.util";
import { isObjectRecord } from "./is-object-record.util";
import { localizeProblemDetails } from "./localize-problem-details.util";
import { mapHttpStatusToProblemTitle } from "./map-http-status-to-problem-title.util";
import { problemCodeForStatus } from "./problem-code-for-status.util";

interface HttpExceptionResponseBody {
  error?: string;
  message?: string | string[];
  statusCode?: number;
}

const isProblemDetails = (value: unknown): value is ProblemDetails =>
  isObjectRecord(value) &&
  "type" in value &&
  "title" in value &&
  "status" in value;

const getResponseMessage = (response: unknown): string | undefined => {
  if (!isObjectRecord(response) || !("message" in response)) {
    return undefined;
  }

  const message = (response as HttpExceptionResponseBody).message;
  return Array.isArray(message) ? message.join(", ") : message;
};

const getHttpExceptionTitle = (error: HttpException): string =>
  mapHttpStatusToProblemTitle(error.getStatus());

const getHttpExceptionDetail = (error: HttpException): string | undefined =>
  getResponseMessage(error.getResponse()) || error.message || undefined;

export const getProblemStatus = (error: unknown): number => {
  if (error instanceof BaseException) {
    return error.status;
  }

  if (error instanceof HttpException) {
    return error.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

export const toProblemDetails = (
  error: unknown,
  instance?: string,
  locale?: string,
): ProblemDetails => {
  if (error instanceof BaseException) {
    return localizeProblemDetails(error.toProblemDetails(instance), locale);
  }

  if (error instanceof AppHttpException) {
    const response = error.getResponse();
    return localizeProblemDetails(
      isProblemDetails(response)
        ? response
        : createProblemDetails({
            code: problemCodeForStatus(error.getStatus()),
            detail: getHttpExceptionDetail(error),
            status: error.getStatus(),
            title: getHttpExceptionTitle(error),
          }),
      locale,
    );
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isProblemDetails(response)) {
      return localizeProblemDetails(response, locale);
    }

    return localizeProblemDetails(
      createProblemDetails({
        code: problemCodeForStatus(error.getStatus()),
        detail: getHttpExceptionDetail(error),
        status: error.getStatus(),
        title: getHttpExceptionTitle(error),
      }),
      locale,
    );
  }

  return localizeProblemDetails(
    createProblemDetails({
      code: "internal-server-error",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: "Internal Server Error",
    }),
    locale,
  );
};
