import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/common/bootstrap";
import { UserApiModule } from "./user-api.module";

void bootstrapNestApi(UserApiModule, {
  appName: "user-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3002,
});
