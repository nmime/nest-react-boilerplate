import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./generated/admin";
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from "./service-options";

const ADMIN_PROFILE_ME_PATH = "/admin/profile/me";

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedPrincipalDto =
  components["schemas"]["AuthenticatedPrincipalDto"];
export type AdminProfileViewDto = components["schemas"]["AdminProfileViewDto"];
export type AdminProfilePayloadDto =
  components["schemas"]["AdminProfilePayloadDto"];

export const adminProfileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(ADMIN_PROFILE_ME_PATH, toOpenApiFetchOptions(options));
export type AdminProfileControllerMeResponse = OpenApiData<
  typeof adminProfileControllerMe
>;
export type AdminProfileControllerMeData =
  EnvelopeData<AdminProfileControllerMeResponse>;
export type AdminProfileControllerMeError = OpenApiError<
  typeof adminProfileControllerMe
>;

export const getAdminProfileControllerMeQueryKey = () =>
  ["get", ADMIN_PROFILE_ME_PATH] as const;
export const getAdminProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AdminProfileControllerMeResponse,
  AdminProfileControllerMeError
> =>
  query.queryOptions(
    "get",
    ADMIN_PROFILE_ME_PATH,
    toOpenApiFetchOptions(options),
  ) as unknown as OpenApiQueryOptions<
    AdminProfileControllerMeResponse,
    AdminProfileControllerMeError
  >;

type OpenApiQueryOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, readonly unknown[]>,
  "queryFn"
> & {
  queryFn: NonNullable<
    UseQueryOptions<TData, TError, TData, readonly unknown[]>["queryFn"]
  >;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData, readonly unknown[]>,
  "queryFn" | "queryKey"
> & {
  request?: ApiClientRequestOptions;
};

export const useAdminProfileControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<
  AdminProfileControllerMeData,
  AdminProfileControllerMeError
> = {}) =>
  useQuery({
    queryKey: [...getAdminProfileControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminProfileControllerMe(request)),
    ...options,
  });
