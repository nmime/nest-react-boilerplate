import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { IntlContext, type IntlContextValue } from "../i18n-context";

export const I18n = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IntlContextValue => {
    const request = context.switchToHttp().getRequest<{
      locale?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const header = request.headers?.["accept-language"];
    const locale =
      request.locale ??
      (Array.isArray(header) ? header[0] : header)?.split(",")[0];

    return IntlContext.resolve(locale);
  },
);
