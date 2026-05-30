import type { WebsocketClientLike } from "./interface";

export abstract class BaseWebsocketClient<
  TMessage = unknown,
> implements WebsocketClientLike<TMessage> {
  constructor(readonly id: string) {}

  abstract send(message: TMessage): Promise<void> | void;

  close(): Promise<void> | void {
    return undefined;
  }
}

export abstract class BaseWebSocketClient<
  TMessage = unknown,
> extends BaseWebsocketClient<TMessage> {}
