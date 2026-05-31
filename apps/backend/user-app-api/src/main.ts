import { bootstrapNestApi } from "@app/common/bootstrap";
import { UserApiModule } from "./user-api.module";

void bootstrapNestApi(UserApiModule, {
  appName: "user-app-api",
  defaultPort: 3002,
});
