import { bootstrapNestApi, resolveDefaultDevelopmentCorsOrigins } from '@app/backend-common-bootstrap';
import { AdminAppApiModule } from './admin-app-api.module';

void bootstrapNestApi(AdminAppApiModule, {
  appName: 'admin-app-api',
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  openApi: { authSchemes: ['session-cookie'] },
  port: 3001,
});
