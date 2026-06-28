import createClient, { type Middleware } from "openapi-fetch";
import createQueryClient from "openapi-react-query";

export interface TypedOpenApiRuntimeOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  middlewares?: readonly Middleware[];
}

export const createTypedOpenApiRuntime = <
  TPaths extends Record<string, unknown>,
>({ middlewares = [], ...options }: TypedOpenApiRuntimeOptions = {}) => {
  const client = createClient<TPaths>(options);

  middlewares.forEach((middleware) => {
    client.use(middleware);
  });

  return {
    client,
    query: createQueryClient(client),
  };
};
