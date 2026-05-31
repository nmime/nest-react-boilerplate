export interface BroadcastOperation<TMessage = unknown> {
  message: TMessage;
  clientIds?: readonly string[];
  excludeClientIds?: readonly string[];
}
