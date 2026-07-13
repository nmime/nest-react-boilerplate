/**
 * Exception kind: client errors (4xx) or server errors (5xx).
 */
export type ExceptionKind = 'client' | 'server';

export const ExceptionKind = {
  Client: 'client' as ExceptionKind,
  Server: 'server' as ExceptionKind,
};
