import {
  QueryClient,
  useQueryClient,
  type DefaultOptions,
} from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FrontendQueryProvider,
  createFrontendQueryClient,
} from "./query-provider";

function QueryClientProbe({
  onClient,
}: Readonly<{ onClient: (client: QueryClient) => void }>) {
  onClient(useQueryClient());
  return null;
}

describe("frontend query provider", () => {
  afterEach(() => {
    cleanup();
  });

  it("creates frontend query clients with defaults and overrides", () => {
    const defaultClient = createFrontendQueryClient();
    const customClient = createFrontendQueryClient({
      defaultOptions: {
        mutations: { retry: 2 },
        queries: { gcTime: 5_000, retry: 3, staleTime: 1_000 },
      } satisfies DefaultOptions,
    });

    expect(defaultClient.getDefaultOptions()).toMatchObject({
      mutations: { retry: false },
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    });
    expect(customClient.getDefaultOptions()).toMatchObject({
      mutations: { retry: 2 },
      queries: {
        gcTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 3,
        staleTime: 1_000,
      },
    });
  });

  it("uses an injected query client", () => {
    const client = new QueryClient();
    let observedClient: QueryClient | undefined;

    render(
      <FrontendQueryProvider client={client}>
        <QueryClientProbe
          onClient={(queryClient) => {
            observedClient = queryClient;
          }}
        />
      </FrontendQueryProvider>,
    );

    expect(observedClient).toBe(client);
  });
});
