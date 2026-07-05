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

  it("keeps delivering when one client send rejects and reports successful sends", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const failing = new TestWebsocketClient<string>("failing");
    const healthy = new TestWebsocketClient<string>("healthy");
    failing.send.mockRejectedValueOnce(new Error("socket closed"));

    adapter.addClient(failing);
    adapter.addClient(healthy);

    await expect(adapter.broadcast({ message: "ping" })).resolves.toBe(1);
    expect(healthy.send).toHaveBeenCalledWith("ping");
  });

  it("clears all clients even when a close call rejects", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const failing = new TestWebsocketClient<string>("failing");
    failing.close.mockRejectedValueOnce(new Error("already closed"));

    adapter.addClient(failing);

    await expect(adapter.closeAll()).resolves.toBeUndefined();
    expect(adapter.getClient("failing")).toBeUndefined();
  });

  it("closes registered clients without depending on a concrete framework", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const client = new TestWebsocketClient<string>("client");

    adapter.addClient(client);

    await adapter.closeAll(1000, "done");

    expect(client.close).toHaveBeenCalledWith(1000, "done");
    expect(adapter.getClient("client")).toBeUndefined();
  });

  it("removes a client so it no longer receives broadcasts", async () => {
    const adapter = new InMemoryWebsocketAdapter<string>();
    const client = new TestWebsocketClient<string>("gone");

    adapter.addClient(client);
    adapter.removeClient("gone");

    expect(adapter.getClient("gone")).toBeUndefined();
    await expect(adapter.broadcast({ message: "hi" })).resolves.toBe(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("gives base clients a no-op close for adapters without teardown", async () => {
    class MinimalClient extends BaseWebsocketClient<string> {
      readonly sent: string[] = [];
      send(message: string): void {
        this.sent.push(message);
      }
    }

    const client = new MinimalClient("minimal");
    expect(client.close()).toBeUndefined();

    const adapter = new InMemoryWebsocketAdapter<string>();
    adapter.addClient(client);
    await adapter.broadcast({ message: "hello" });
    await adapter.closeAll();

    expect(client.sent).toEqual(["hello"]);
    expect(adapter.getClient("minimal")).toBeUndefined();
  });
});
