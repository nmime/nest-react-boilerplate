import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/backend/common/bootstrap";
import { UserAppApiModule } from "./user-app-api.module";

void bootstrapNestApi(UserAppApiModule, {
  appName: "user-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3002,
});
