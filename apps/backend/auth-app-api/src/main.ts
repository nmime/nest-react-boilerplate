import { bootstrapNestApi } from "@app/common/bootstrap";
import { AuthApiModule } from "./auth-api.module";

void bootstrapNestApi(AuthApiModule, {
  appName: "auth-app-api",
  defaultPort: 3003,
});
