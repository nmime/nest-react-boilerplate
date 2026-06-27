import { describe, expect, it, vi } from "vitest";

import { BaseWebsocketClient, InMemoryWebsocketAdapter } from "./index";

class TestWebsocketClient<TMessage> extends BaseWebsocketClient<TMessage> {
  readonly close = vi.fn();
  readonly send = vi.fn();
}

describe("shared websocket contracts", () => {
  it("broadcasts to included clients while honoring exclusions", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const first = new TestWebsocketClient<string>("first");
    const second = new TestWebsocketClient<string>("second");

    adapter.addClient(first);
    adapter.addClient(second);

    await expect(
      adapter.broadcast({
        message: "connected",
        clientIds: ["first", "second"],
        excludeClientIds: ["second"],
      }),
    ).resolves.toBe(1);

    expect(first.send).toHaveBeenCalledWith("connected");
    expect(second.send).not.toHaveBeenCalled();
  });

  it("closes registered clients without depending on a concrete framework", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const client = new TestWebsocketClient<string>("client");

    adapter.addClient(client);

    await adapter.closeAll(1000, "done");

    expect(client.close).toHaveBeenCalledWith(1000, "done");
    expect(adapter.getClient("client")).toBeUndefined();
  });
});
