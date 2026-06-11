import { applyDecorators, UseFilters, UseInterceptors } from "@nestjs/common";
import { ExceptionsResponseTransformer } from "./exceptions-response.transformer";
import { ExceptionsFilter } from "./response";

export const UseTransformer = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseInterceptors(ExceptionsResponseTransformer),
    UseFilters(ExceptionsFilter),
  );
