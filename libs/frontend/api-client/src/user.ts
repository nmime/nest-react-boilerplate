import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./generated/user";
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from "./service-options";

const PROFILE_ME_PATH = "/profile/me";

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedPrincipalDto =
  components["schemas"]["AuthenticatedPrincipalDto"];
export type UserProfileViewDto = components["schemas"]["UserProfileViewDto"];
export type ProfilePayloadDto = components["schemas"]["ProfilePayloadDto"];

export const profileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(PROFILE_ME_PATH, toOpenApiFetchOptions(options));
export type ProfileControllerMeResponse = OpenApiData<
  typeof profileControllerMe
>;
export type ProfileControllerMeData = EnvelopeData<ProfileControllerMeResponse>;
export type ProfileControllerMeError = OpenApiError<typeof profileControllerMe>;

export const getProfileControllerMeQueryKey = () =>
  ["get", PROFILE_ME_PATH] as const;
export const getProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<ProfileControllerMeResponse, ProfileControllerMeError> =>
  query.queryOptions(
    "get",
    PROFILE_ME_PATH,
    toOpenApiFetchOptions(options),
  ) as unknown as OpenApiQueryOptions<
    ProfileControllerMeResponse,
    ProfileControllerMeError
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

export const useProfileControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<ProfileControllerMeData, ProfileControllerMeError> = {}) =>
  useQuery({
    queryKey: [...getProfileControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(profileControllerMe(request)),
    ...options,
  });
