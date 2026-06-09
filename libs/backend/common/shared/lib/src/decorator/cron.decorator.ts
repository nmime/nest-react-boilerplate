import { SetMetadata } from "@nestjs/common";

export const CronExpressionMetadataKey = "app:cron-expression";
export const Cron = (expression: string): MethodDecorator =>
  SetMetadata(CronExpressionMetadataKey, expression);
