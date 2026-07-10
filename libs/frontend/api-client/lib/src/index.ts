import * as adminApi from './admin';
import * as authApi from './auth';
import * as generatedAdminApi from './generated/admin';
import * as generatedAuthApi from './generated/auth';
import * as generatedUserApi from './generated/user';
import * as userApi from './user';

export { adminApi, authApi, generatedAdminApi, generatedAuthApi, generatedUserApi, userApi };

export * from './client-registry';
export * from './service-options';
export * from './toast-rules';

// Better-Auth client integrations (our additions)
export * from './auth-client';
export * from './telegram-client';
export * from './use-auth-session-flow';
