export interface AdminRequestContext {
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export const createAdminRequestContext = (input: AdminRequestContext): AdminRequestContext => ({
  ...(input.requestId ? { requestId: input.requestId } : {}),
  ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
  ...(input.userAgent ? { userAgent: input.userAgent } : {}),
});
