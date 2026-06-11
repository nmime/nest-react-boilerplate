import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/common/bootstrap";
import { AuthApiModule } from "./auth-api.module";

void bootstrapNestApi(AuthApiModule, {
  appName: "auth-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3003,
});
