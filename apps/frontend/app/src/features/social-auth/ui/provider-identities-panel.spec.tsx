import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientProvider } from "@app/frontend/api-client";
import { FrontendI18nProvider, FrontendStateProvider } from "@app/frontend/ui";
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
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onLink = vi.fn();
  const view = render(
    <FrontendStateProvider initialBearerToken="session-token">
      <ApiClientProvider
        authToken="session-token"
        baseUrls={{ admin: "", auth: "https://auth-api", user: "" }}
        fetchImpl={fetchMock}
      >
        <QueryClientProvider client={queryClient}>
          <FrontendI18nProvider userLocale="en">
            <ProviderIdentitiesPanel onLink={onLink} t={(key) => key} />
          </FrontendI18nProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    </FrontendStateProvider>,
  );

  return { invalidateSpy, onLink, queryClient, ...view };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProviderIdentitiesPanel", () => {
  it("renders empty provider identities and link actions", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { identities: [] } }));
    const { onLink } = renderPanel(fetchMock);

    expect(
      await screen.findAllByText("auth.social.status.notLinked"),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "auth.social.button.linkTelegram" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "auth.social.button.linkDiscord" }),
    );

    expect(onLink).toHaveBeenNthCalledWith(1, "telegram");
    expect(onLink).toHaveBeenNthCalledWith(2, "discord");
  });

  it("renders linked Telegram and Discord identities with nullable email fallbacks", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          identities: [
            {
              displayName: "Telegram User",
              email: null,
              id: "telegram-identity",
              provider: "telegram",
            },
            {
              email: null,
              id: "discord-identity",
              provider: "discord",
              providerSubject: "discord-subject",
            },
          ],
        },
      }),
    );

    renderPanel(fetchMock);

    expect(
      await screen.findAllByText("auth.social.status.linked"),
    ).toHaveLength(2);
    expect(screen.getByText("Telegram User")).toBeTruthy();
    expect(screen.getByText("discord-subject")).toBeTruthy();
  });

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

  it("invalidates provider identity cache and renders success after unlink", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            identities: [
              {
                email: "discord@example.com",
                id: "discord-identity",
                provider: "discord",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: {} }));
    const { invalidateSpy } = renderPanel(fetchMock);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "auth.social.button.unlinkDiscord",
      }),
    );

    expect(await screen.findByText("auth.social.unlink.success")).toBeTruthy();
    expect(screen.getAllByText("auth.provider.discord").length).toBeGreaterThan(
      0,
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["get", "/auth/provider-identities"],
      }),
    );
  });

  it("renders step-up required errors when unlink is forbidden", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            identities: [
              {
                id: "telegram-identity",
                provider: "telegram",
                username: "telegram-user",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 403));

    renderPanel(fetchMock);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "auth.social.button.unlinkTelegram",
      }),
    );

    expect(await screen.findByText("auth.social.stepUp.required")).toBeTruthy();
  });

  it("keeps last-method identities linked and disables destructive unlink", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          identities: [
            {
              id: "telegram-identity",
              isLastMethod: true,
              provider: "telegram",
              username: "telegram-user",
            },
          ],
        },
      }),
    );

    renderPanel(fetchMock);

    expect(
      await screen.findByText("auth.social.lastMethod.warning"),
    ).toBeTruthy();
    const unlinkButton = screen.getByRole("button", {
      name: "auth.social.button.unlinkTelegram",
    });
    expect((unlinkButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders provider unavailable errors from the identities query", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, false, 503));

    renderPanel(fetchMock);

    expect(await screen.findByText("Request failed with 503.")).toBeTruthy();
  });
});
