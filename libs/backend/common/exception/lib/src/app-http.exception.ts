import { HttpException } from "@nestjs/common";
import type { ProblemDetailsInput } from "./type/problem-details-input.type";
import { createProblemDetails } from "./util/create-problem-details.util";

export class AppHttpException extends HttpException {
  constructor(input: ProblemDetailsInput) {
    super(createProblemDetails(input), input.status);
  }
}
