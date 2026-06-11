import { applyDecorators, UsePipes } from "@nestjs/common";
import { createValidationPipe } from "../create-validation.pipe";

export const ApiValidation = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UsePipes(createValidationPipe()));
