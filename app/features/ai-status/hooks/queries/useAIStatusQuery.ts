// ABOUTME: React Query hook for fetching and caching AI status
// ABOUTME: Provides automatic refetching and background updates

import { useQuery } from '@tanstack/react-query';
import { fetchAIStatus } from '../../data/services/ai-status.service';
import type { AIStatus } from '../../data/schemas/ai-status.schema';

export const AI_STATUS_QUERY_KEY = ['ai-status'] as const;

/**
 * React Query hook for fetching AI status
 *
 * Features:
 * - Initial fetch on mount
 * - Background refetch every 10 minutes
 * - Refetch on window focus
 * - 5 minute cache time
 * - Automatic error handling
 *
 * @returns UseQueryResult<AIStatus>
 */
export function useAIStatusQuery() {
  return useQuery<AIStatus, Error>({
    queryKey: AI_STATUS_QUERY_KEY,
    queryFn: fetchAIStatus,

    // Cache configuration
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (formerly cacheTime)

    // Refetch configuration
    refetchOnWindowFocus: true, // Check status when user returns to tab
    refetchOnReconnect: true, // Check status when internet reconnects
    refetchInterval: 10 * 60 * 1000, // Background refetch every 10 minutes

    // Error handling
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

    // Don't show loading state on background refetches
    // notifyOnChangeProps: ['data', 'error'],
  });
}
