import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export const createFrontendQueryClient = (
  config?: QueryClientConfig,
): QueryClient =>
  new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
        ...config?.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        ...config?.defaultOptions?.mutations,
      },
    },
  });

export const frontendQueryClient = createFrontendQueryClient();

export function FrontendQueryProvider({
  children,
  client,
}: Readonly<{ children: ReactNode; client?: QueryClient }>) {
  const [ownedClient] = useState(() => client ?? createFrontendQueryClient());

  return (
    <QueryClientProvider client={ownedClient}>{children}</QueryClientProvider>
  );
}
