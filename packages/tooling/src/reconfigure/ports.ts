import type { NrbConfig } from '../setup/schema.ts';
export const portOrder = [
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'admin-app',
  'user-app',
  'landing-app',
  'site-app',
  'mobile-app',
  'postgres',
  'redis',
  'mongodb',
  'nats',
  'nats-monitor',
  'minio',
  'minio-console',
  'otlp-grpc',
  'otlp-http',
  'edge',
  'grafana',
  'prometheus',
  'loki',
  'tempo',
] as const;
export type RuntimePortName = (typeof portOrder)[number];
export interface PortDefinition {
  role: string;
  environment: string;
  scope: 'application' | 'infrastructure' | 'observability';
}
export const portDefinitions: Record<RuntimePortName, PortDefinition> = {
  'admin-app-api': { role: 'Backend API (admin)', environment: 'ADMIN_APP_API_PORT', scope: 'application' },
  'user-app-api': { role: 'Backend API (user)', environment: 'USER_APP_API_PORT', scope: 'application' },
  'auth-app-api': { role: 'Backend API (auth)', environment: 'AUTH_APP_API_PORT', scope: 'application' },
  'discord-app-api': { role: 'Backend API (Discord bot)', environment: 'DISCORD_APP_API_PORT', scope: 'application' },
  'telegram-bot-api': {
    role: 'Backend API (Telegram bot)',
    environment: 'TELEGRAM_BOT_API_PORT',
    scope: 'application',
  },
  'admin-app': { role: 'Frontend (admin panel)', environment: 'ADMIN_APP_PORT', scope: 'application' },
  'user-app': { role: 'Frontend (user dashboard)', environment: 'USER_APP_PORT', scope: 'application' },
  'landing-app': { role: 'Frontend (landing page)', environment: 'LANDING_APP_PORT', scope: 'application' },
  'site-app': { role: 'Frontend (Vike SSR site)', environment: 'SITE_APP_PORT', scope: 'application' },
  'mobile-app': { role: 'Frontend (Expo mobile/web)', environment: 'MOBILE_APP_PORT', scope: 'application' },
  postgres: { role: 'Database', environment: 'POSTGRES_PORT', scope: 'infrastructure' },
  redis: { role: 'Cache / sessions', environment: 'REDIS_PORT', scope: 'infrastructure' },
  mongodb: { role: 'Alternative database', environment: 'MONGODB_PORT', scope: 'infrastructure' },
  nats: { role: 'Messaging', environment: 'NATS_PORT', scope: 'infrastructure' },
  'nats-monitor': { role: 'NATS metrics', environment: 'NATS_MONITOR_PORT', scope: 'infrastructure' },
  minio: { role: 'Object storage', environment: 'MINIO_PORT', scope: 'infrastructure' },
  'minio-console': { role: 'Object storage UI', environment: 'MINIO_CONSOLE_PORT', scope: 'infrastructure' },
  'otlp-grpc': { role: 'OTLP gRPC', environment: 'OTEL_COLLECTOR_GRPC_PORT', scope: 'observability' },
  'otlp-http': { role: 'OTLP HTTP', environment: 'OTEL_COLLECTOR_HTTP_PORT', scope: 'observability' },
  edge: { role: 'Reverse proxy / edge', environment: 'EDGE_PORT', scope: 'infrastructure' },
  grafana: { role: 'Grafana UI', environment: 'GRAFANA_PORT', scope: 'observability' },
  prometheus: { role: 'Prometheus metrics', environment: 'PROMETHEUS_PORT', scope: 'observability' },
  loki: { role: 'Loki logs', environment: 'LOKI_PORT', scope: 'observability' },
  tempo: { role: 'Tempo traces', environment: 'TEMPO_PORT', scope: 'observability' },
};
export function renderPortsDocument(config: NrbConfig): string {
  const rows = (scope: PortDefinition['scope']) =>
    portOrder
      .filter((name) => portDefinitions[name].scope === scope)
      .map(
        (name) =>
          `| \`${name}\` | ${config.runtime.ports[name]} | \`${portDefinitions[name].environment}\` | ${portDefinitions[name].role} |`,
      )
      .join('\n');
  const staging = portOrder
    .map(
      (name) =>
        `| \`${name}\` | ${config.runtime.ports[name] + config.runtime.stagingOffset} | ${config.runtime.ports[name]} | ${portDefinitions[name].role} |`,
    )
    .join('\n');
  return `# Service Port Registry\n\nGenerated from \`nrb.config.json\` by \`nrb reconfigure\`. Do not edit by hand.\n\n## Application ports\n\n| Service | Port | Environment | Role |\n| --- | ---: | --- | --- |\n${rows('application')}\n\n## Infrastructure ports\n\n| Service | Port | Environment | Role |\n| --- | ---: | --- | --- |\n${rows('infrastructure')}\n\n## Observability ports\n\n| Service | Port | Environment | Role |\n| --- | ---: | --- | --- |\n${rows('observability')}\n\n## Staging matrix\n\nStaging uses the configured offset **+${config.runtime.stagingOffset}**.\n\n| Service | Staging port | Base port | Role |\n| --- | ---: | ---: | --- |\n${staging}\n\n## Container and proxy ports\n\n- Backend and SSR containers listen on \`${config.runtime.containerPort}\`.\n- SPA nginx containers and the Compose edge listen on \`${config.runtime.ports.edge}\`.\n- Caddy, nginx, Helm and smoke probes derive their targets from this matrix.\n`;
}
