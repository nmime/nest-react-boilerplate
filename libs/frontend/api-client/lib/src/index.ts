import * as adminApi from "./admin";
import * as authApi from "./auth";
import * as generatedAdminApi from "./generated/admin";
import * as generatedAuthApi from "./generated/auth";
import * as generatedUserApi from "./generated/user";
import * as userApi from "./user";

export {
  adminApi,
  authApi,
  generatedAdminApi,
  generatedAuthApi,
  generatedUserApi,
  userApi,
};

export * from "./client-registry";
export * from "./service-options";
export * from "./toast-rules";
