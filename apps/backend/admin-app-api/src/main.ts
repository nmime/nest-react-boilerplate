import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/common/bootstrap";
import { AdminAppApiModule } from "./admin-app-api.module";

void bootstrapNestApi(AdminAppApiModule, {
  appName: "backend-admin-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3001,
});
