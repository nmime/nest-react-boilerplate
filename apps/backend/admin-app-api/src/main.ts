import { bootstrapNestApi } from "@app/common/bootstrap";
import { AdminAppApiModule } from "./admin-app-api.module";

void bootstrapNestApi(AdminAppApiModule, {
  appName: "backend-admin-app-api",
  defaultPort: 3001,
});
