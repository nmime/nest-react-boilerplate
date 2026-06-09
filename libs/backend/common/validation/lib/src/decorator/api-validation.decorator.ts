import { applyDecorators, UsePipes } from "@nestjs/common";
import { createProblemValidationPipe } from "../create-problem-validation.pipe";

export const ApiValidation = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UsePipes(createProblemValidationPipe()));
