export interface AdminRequestContext {
  readonly requestId?: string;
}

export const createAdminRequestContext = (input: {
  readonly requestId?: string;
}): AdminRequestContext => ({
  ...(input.requestId ? { requestId: input.requestId } : {}),
});
