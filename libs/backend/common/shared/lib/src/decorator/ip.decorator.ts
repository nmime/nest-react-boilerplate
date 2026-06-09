import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const Ip = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ ip?: string }>().ip,
);
