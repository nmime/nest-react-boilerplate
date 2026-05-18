import { defineConfig } from "orval";

export const apiClientServices = {
  auth: {
    input: "docs/openapi/auth-app-api.json",
    output: "libs/frontend/api-client/src/generated/auth/index.ts",
  },
  user: {
    input: "docs/openapi/user-app-api.json",
    output: "libs/frontend/api-client/src/generated/user/index.ts",
  },
  admin: {
    input: "docs/openapi/admin-app-api.json",
    output: "libs/frontend/api-client/src/generated/admin/index.ts",
  },
};

export default defineConfig(
  Object.fromEntries(
    Object.entries(apiClientServices).map(([name, service]) => [
      name,
      {
        input: { target: service.input },
        output: {
          target: service.output,
          client: "react-query",
          httpClient: "axios",
          clean: true,
          prettier: true,
          override: {
            mutator: {
              path: "libs/frontend/api-client/src/api-client-mutator.ts",
              name: "apiClientMutator",
            },
            query: {
              useQuery: true,
              useMutation: true,
              signal: true,
            },
          },
        },
      },
    ]),
  ),
);
