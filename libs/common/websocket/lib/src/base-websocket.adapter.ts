import type { BroadcastOperation } from "./broadcast-operation";
import type { WebsocketClientLike } from "./interface";

export class InMemoryWebsocketAdapter<TMessage = unknown> {
  private readonly clients = new Map<string, WebsocketClientLike<TMessage>>();

  addClient(client: WebsocketClientLike<TMessage>): void {
    this.clients.set(client.id, client);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClient(clientId: string): WebsocketClientLike<TMessage> | undefined {
    return this.clients.get(clientId);
  }

  async broadcast(operation: BroadcastOperation<TMessage>): Promise<number> {
    const include = operation.clientIds
      ? new Set(operation.clientIds)
      : undefined;
    const exclude = new Set(operation.excludeClientIds ?? []);
    const targets = [...this.clients.values()].filter(
      (client) =>
        (!include || include.has(client.id)) && !exclude.has(client.id),
    );

    // One failing client must not abort delivery to the rest; report how many
    // sends actually succeeded rather than how many were targeted.
    const outcomes = await Promise.allSettled(
      targets.map((client) => Promise.resolve(client.send(operation.message))),
    );
    return outcomes.filter((outcome) => outcome.status === "fulfilled").length;
  }

  async closeAll(code?: number, reason?: string): Promise<void> {
    // Always clear the registry, even if some clients throw while closing.
    await Promise.allSettled(
      [...this.clients.values()].map((client) =>
        Promise.resolve(client.close?.(code, reason)),
      ),
    );
    this.clients.clear();
  }
}
