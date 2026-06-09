import type { IncomingMessage } from "node:http";

export interface RequestWithClientAddress {
  headers?: IncomingMessage["headers"];
  socket?: { remoteAddress?: string | null };
  ip?: string;
}

export function getClientIp(
  request: RequestWithClientAddress,
): string | undefined {
  const requestIp = request.ip?.trim();
  if (requestIp) {
    return requestIp;
  }

  return request.socket?.remoteAddress?.trim() || undefined;
}
