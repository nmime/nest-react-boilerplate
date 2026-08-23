export const AuthPersistenceEndpointRegistry = [
  {
    project: 'admin-app-api',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'auth:expired-token-cleanup',
  },
  {
    project: 'auth-app-api',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'auth:expired-token-cleanup',
  },
  {
    project: 'notification-consumer',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'auth:expired-token-cleanup',
  },
  {
    project: 'notification-scheduler',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'auth:expired-token-cleanup',
  },
  {
    project: 'user-app-api',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'auth:expired-token-cleanup',
  },
] as const;
