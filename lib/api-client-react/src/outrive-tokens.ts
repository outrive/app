import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { customFetch } from './custom-fetch';
import type { Token } from './generated/api.schemas';

export const getListOutriveTokensUrl = () => `/api/outrive/tokens`;

// Unwraps the { tokens, meta } envelope — returns Token[] for convenience
export const listOutriveTokens = async (): Promise<Token[]> => {
  const data = await customFetch<{ tokens: Token[]; meta: { total: number } }>(getListOutriveTokensUrl());
  return data?.tokens ?? [];
};

// Different key from MarketPage's internal 'outrive-tokens' hook to avoid cache shape conflict
export const getListOutriveTokensQueryKey = () => ['outrive-tokens-panel'] as const;

export function useListOutriveTokens(
  options?: { query?: Partial<UseQueryOptions<Token[], Error>> }
) {
  return useQuery<Token[], Error>({
    queryKey: getListOutriveTokensQueryKey(),
    queryFn: listOutriveTokens,
    ...(options?.query ?? {}),
  });
}
