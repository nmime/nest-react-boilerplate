import type { IncomingMessage } from "node:http";

export interface RequestWithClientAddress {
  headers?: IncomingMessage["headers"];
  socket?: { remoteAddress?: string | null };
  ip?: string;
}

export function getClientIp(
  request: RequestWithClientAddress,
): string | undefined {
  const forwardedFor = request.headers?.["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  const forwardedIp = forwardedValue?.split(",")[0]?.trim();

  return (
    forwardedIp || request.ip || request.socket?.remoteAddress || undefined
  );
}
