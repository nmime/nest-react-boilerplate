import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/backend/common/bootstrap";
import { AuthAppApiModule } from "./auth-app-api.module";

void bootstrapNestApi(AuthAppApiModule, {
  appName: "auth-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3003,
});
