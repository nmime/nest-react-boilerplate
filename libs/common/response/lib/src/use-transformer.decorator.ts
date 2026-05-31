import { applyDecorators, UseFilters, UseInterceptors } from "@nestjs/common";
import { ProblemResponseTransformer } from "./problem-response.transformer";
import { ProblemExceptionFilter } from "./response";

export const UseTransformer = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseInterceptors(ProblemResponseTransformer),
    UseFilters(ProblemExceptionFilter),
  );
