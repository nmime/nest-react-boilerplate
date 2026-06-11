import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const Lang = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ locale?: string }>().locale ?? "en",
);
