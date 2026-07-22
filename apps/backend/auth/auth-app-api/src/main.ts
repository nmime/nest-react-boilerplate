import { bootstrapNestApi, resolveDefaultDevelopmentCorsOrigins } from '@app/backend-common-bootstrap';
import { AuthAppApiModule } from './auth-app-api.module';

void bootstrapNestApi(AuthAppApiModule, {
  appName: 'auth-app-api',
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  openApi: { authSchemes: ['session-cookie'] },
  port: 3003,
});
