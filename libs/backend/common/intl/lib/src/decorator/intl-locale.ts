import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { IntlContext, type IntlContextValue } from "../i18n-context";

type IntlLocaleRequest = {
  locale?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type HttpRequestProvider = {
  getRequest<TRequest>(): TRequest;
};

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function localeFromRequest(request: IntlLocaleRequest): string | undefined {
  const header = firstHeaderValue(request.headers?.["accept-language"]);
  return request.locale ?? header?.split(",")[0];
}

function requestFromContext(context: ExecutionContext): IntlLocaleRequest {
  const http = context.switchToHttp() as HttpRequestProvider;
  return http.getRequest<IntlLocaleRequest>();
}

export const IntlLocale = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IntlContextValue =>
    IntlContext.resolve(localeFromRequest(requestFromContext(context))),
);
