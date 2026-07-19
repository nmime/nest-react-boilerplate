import { getApiErrorDisplayMessage } from '@app/frontend-api-support';

export const getErrorReason = (error: unknown, fallback: string): string => {
  return getApiErrorDisplayMessage(error, fallback);
};
