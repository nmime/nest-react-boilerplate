import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const Geo = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ geo?: unknown }>().geo,
);
