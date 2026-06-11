export interface WebsocketClientLike<TMessage = unknown> {
  id: string;
  send(message: TMessage): Promise<void> | void;
  close?(code?: number, reason?: string): Promise<void> | void;
}

export type IWebSocketClient<TMessage = unknown> =
  WebsocketClientLike<TMessage>;
