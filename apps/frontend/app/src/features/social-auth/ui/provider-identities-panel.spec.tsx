import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiClientProvider } from "@app/api-client";
import { FrontendI18nProvider, FrontendStateProvider } from "@app/frontend-ui";
import { ProviderIdentitiesPanel } from "./provider-identities-panel";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
    statusText: ok ? "OK" : "Error",
  });

const renderPanel = (fetchMock: ReturnType<typeof vi.fn>) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <FrontendStateProvider initialBearerToken="session-token">
      <ApiClientProvider
        authToken="session-token"
        baseUrls={{ admin: "", auth: "https://auth-api", user: "" }}
        fetchImpl={fetchMock}
      >
        <QueryClientProvider client={queryClient}>
          <FrontendI18nProvider userLocale="en">
            <ProviderIdentitiesPanel onLink={vi.fn()} t={(key) => key} />
          </FrontendI18nProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    </FrontendStateProvider>,
  );
};

describe("ProviderIdentitiesPanel", () => {
  it("renders linked and unlinked providers and maps unlink conflicts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            identities: [
              {
                displayName: "Telegram User",
                id: "telegram-identity",
                provider: "telegram",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { code: "last_method", detail: "last method" },
          false,
          409,
        ),
      );

    renderPanel(fetchMock);

    expect(await screen.findByText("auth.social.status.linked")).toBeTruthy();
    expect(screen.getByText("auth.social.status.notLinked")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "auth.social.button.unlinkTelegram" }),
    );

    expect(
      await screen.findByText("auth.social.lastMethod.blocked"),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
