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

    await Promise.all(
      targets.map((client) => Promise.resolve(client.send(operation.message))),
    );
    return targets.length;
  }

  async closeAll(code?: number, reason?: string): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((client) =>
        Promise.resolve(client.close?.(code, reason)),
      ),
    );
    this.clients.clear();
  }
}

export class BaseWebSocketAdapter<
  TMessage = unknown,
> extends InMemoryWebsocketAdapter<TMessage> {}
