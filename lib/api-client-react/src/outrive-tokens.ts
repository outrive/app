import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { customFetch } from './custom-fetch';
import type { Token } from './generated/api.schemas';

export const getListOutriveTokensUrl = () => `/api/outrive/tokens`;

export const listOutriveTokens = async (): Promise<Token[]> =>
  customFetch<Token[]>(getListOutriveTokensUrl());

export const getListOutriveTokensQueryKey = () => ['outrive-tokens'] as const;

export function useListOutriveTokens(
  options?: { query?: Partial<UseQueryOptions<Token[], Error>> }
) {
  return useQuery<Token[], Error>({
    queryKey: getListOutriveTokensQueryKey(),
    queryFn: listOutriveTokens,
    ...(options?.query ?? {}),
  });
}
