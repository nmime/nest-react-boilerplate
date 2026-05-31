import type {
  components as AdminComponents,
  operations as AdminOperations,
  paths as AdminPaths,
} from "./generated/admin-app-api";
import type {
  components as AuthComponents,
  operations as AuthOperations,
  paths as AuthPaths,
} from "./generated/auth-app-api";
import type {
  components as UserComponents,
  operations as UserOperations,
  paths as UserPaths,
} from "./generated/user-app-api";

export * as AdminApiContract from "./generated/admin-app-api";
export * as AuthApiContract from "./generated/auth-app-api";
export * as UserApiContract from "./generated/user-app-api";

export type AdminApiComponents = AdminComponents;
export type AdminApiOperations = AdminOperations;
export type AdminApiPaths = AdminPaths;
export type AuthApiComponents = AuthComponents;
export type AuthApiOperations = AuthOperations;
export type AuthApiPaths = AuthPaths;
export type UserApiComponents = UserComponents;
export type UserApiOperations = UserOperations;
export type UserApiPaths = UserPaths;

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
