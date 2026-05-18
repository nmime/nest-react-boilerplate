import type { components as AdminComponents } from "./generated/admin-app-api";
import type { components as AuthComponents } from "./generated/auth-app-api";
import type { components as UserComponents } from "./generated/user-app-api";

export type {
  components as AdminApiComponents,
  operations as AdminApiOperations,
  paths as AdminApiPaths,
} from "./generated/admin-app-api";
export type {
  components as AuthApiComponents,
  operations as AuthApiOperations,
  paths as AuthApiPaths,
} from "./generated/auth-app-api";
export type {
  components as UserApiComponents,
  operations as UserApiOperations,
  paths as UserApiPaths,
} from "./generated/user-app-api";

type Schema<
  TComponents extends { schemas: object },
  TName extends keyof TComponents["schemas"],
> = TComponents["schemas"][TName];

export type ApiEnvelope<T> = { data?: T };

export type AuthenticatedPrincipalContract = Schema<
  AuthComponents,
  "AuthenticatedPrincipalDto"
>;
export type AuthenticatedUserContract = Schema<
  AuthComponents,
  "AuthenticatedUserViewDto"
>;
export type AuthSessionContract = Schema<AuthComponents, "AuthSessionViewDto">;
export type AuthMeContract = Schema<AuthComponents, "MePayloadDto">;
export type SupportedLocalesContract = Schema<
  AuthComponents,
  "SupportedLocalesPayloadDto"
>;
export type LogoutContract = Schema<AuthComponents, "LogoutPayloadDto">;

export type UserProfileContract = Schema<UserComponents, "ProfilePayloadDto">;
export type UserProfileViewContract = Schema<
  UserComponents,
  "UserProfileViewDto"
>;

export type AdminPrincipalContract = Schema<
  AdminComponents,
  "AuthenticatedPrincipalDto"
>;
export type AdminProfileContract = Schema<
  AdminComponents,
  "AdminProfilePayloadDto"
>;
export type AdminProfileViewContract = Schema<
  AdminComponents,
  "AdminProfileViewDto"
>;
