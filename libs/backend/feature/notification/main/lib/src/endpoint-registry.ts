export const NotificationEndpointRegistry = [
  {
    project: 'notification-consumer',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'notification:consumer-loop',
  },
  {
    project: 'notification-scheduler',
    kind: 'cron',
    method: 'N/A',
    path: 'notification:cron:broadcast-activation',
  },
  {
    project: 'notification-scheduler',
    kind: 'cron',
    method: 'N/A',
    path: 'notification:cron:delivery-dispatch',
  },
  {
    project: 'notification-scheduler',
    kind: 'cron',
    method: 'N/A',
    path: 'notification:cron:partition-maintenance',
  },
  {
    project: 'notification-scheduler',
    kind: 'lifecycle',
    method: 'N/A',
    path: 'notification:provider-readiness',
  },
] as const;
