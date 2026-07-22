import { bootstrapNestApi, resolveDefaultDevelopmentCorsOrigins } from '@app/backend-common-bootstrap';
import { UserAppApiModule } from './user-app-api.module';

void bootstrapNestApi(UserAppApiModule, {
  appName: 'user-app-api',
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  openApi: { authSchemes: ['session-cookie'] },
  port: 3002,
});
