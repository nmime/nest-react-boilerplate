import type { DefaultError, QueryKey } from '@tanstack/react-query';
import {
  Mutation as MobxMutation,
  Query as MobxQuery,
  type AnyQueryClient,
  type MutationConfig,
  type QueryConfig,
} from 'mobx-tanstack-query';

import { frontendQueryClient } from './query-provider';

export { InfiniteQuery as MobxInfiniteQuery, Mutation as MobxMutation, Query as MobxQuery } from 'mobx-tanstack-query';
export type { AnyQueryClient, InfiniteQueryConfig, MutationConfig, QueryConfig } from 'mobx-tanstack-query';

type WithOptionalQueryClient<TConfig extends { queryClient: AnyQueryClient }> = Omit<TConfig, 'queryClient'> & {
  queryClient?: AnyQueryClient;
};

export const createMobxQuery = <
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  config: WithOptionalQueryClient<QueryConfig<TQueryFnData, TError, TData, TQueryData, TQueryKey>>,
): MobxQuery<TQueryFnData, TError, TData, TQueryData, TQueryKey> =>
  new MobxQuery({ queryClient: frontendQueryClient, ...config });

export const createMobxMutation = <TData = unknown, TVariables = void, TError = DefaultError, TContext = unknown>(
  config: WithOptionalQueryClient<MutationConfig<TData, TVariables, TError, TContext>>,
): MobxMutation<TData, TVariables, TError, TContext> =>
  new MobxMutation({ queryClient: frontendQueryClient, ...config });
