import { HttpException, HttpStatus } from "@nestjs/common";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export interface ProblemDetailsInput {
  title: string;
  status: number;
  detail?: string;
  type?: string;
  instance?: string;
}

export const createProblemDetails = ({
  title,
  status,
  detail,
  type = "about:blank",
  instance,
}: ProblemDetailsInput): ProblemDetails => ({
  type,
  title,
  status,
  ...(detail ? { detail } : {}),
  ...(instance ? { instance } : {}),
});

export class ProblemHttpException extends HttpException {
  constructor(input: ProblemDetailsInput) {
    super(createProblemDetails(input), input.status);
  }
}

export const getProblemStatus = (error: unknown): number => {
  if (error instanceof HttpException) {
    return error.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

const getHttpExceptionTitle = (error: HttpException): string => {
  const response = error.getResponse();

  if (typeof response === "object" && "message" in response) {
    return String(response.message);
  }

  return error.message;
};

export const toProblemDetails = (error: unknown): ProblemDetails => {
  if (error instanceof ProblemHttpException) {
    return error.getResponse() as ProblemDetails;
  }

  if (error instanceof HttpException) {
    return createProblemDetails({
      status: error.getStatus(),
      title: getHttpExceptionTitle(error),
    });
  }

  return createProblemDetails({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: "Internal Server Error",
  });
};
