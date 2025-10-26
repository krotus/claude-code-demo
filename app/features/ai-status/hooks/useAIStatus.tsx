// ABOUTME: React Context for global AI status management
// ABOUTME: Provides AI availability status to all components via useAIStatus hook

'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useAIStatusQuery } from './queries/useAIStatusQuery';
import type { AIStatus } from '../data/schemas/ai-status.schema';

/**
 * Context value type
 */
interface AIStatusContextValue {
  /** Current AI status data */
  status: AIStatus | undefined;
  /** Whether the status is currently loading */
  isLoading: boolean;
  /** Error object if status fetch failed */
  error: Error | null;
  /** Whether AI chat feature is available */
  isAIChatAvailable: boolean;
  /** Whether conversation history is accessible */
  isConversationHistoryAvailable: boolean;
  /** Whether the query is currently refetching in the background */
  isRefetching: boolean;
}

const AIStatusContext = createContext<AIStatusContextValue | undefined>(undefined);

/**
 * Provider component that wraps the app to provide AI status
 *
 * @example
 * <AIStatusProvider>
 *   <App />
 * </AIStatusProvider>
 */
export function AIStatusProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, isRefetching } = useAIStatusQuery();

  const value: AIStatusContextValue = {
    status: data,
    isLoading,
    error,
    isRefetching,
    isAIChatAvailable: data?.features.aiChat ?? false,
    isConversationHistoryAvailable: data?.features.conversationHistory ?? true,
  };

  return (
    <AIStatusContext.Provider value={value}>
      {children}
    </AIStatusContext.Provider>
  );
}

/**
 * Hook to access AI status from any component
 *
 * @throws Error if used outside AIStatusProvider
 *
 * @example
 * function MyComponent() {
 *   const { isAIChatAvailable, isLoading } = useAIStatus();
 *
 *   if (isLoading) return <Loading />;
 *   if (!isAIChatAvailable) return <AIUnavailableBanner />;
 *
 *   return <ChatInterface />;
 * }
 */
export function useAIStatus(): AIStatusContextValue {
  const context = useContext(AIStatusContext);

  if (context === undefined) {
    throw new Error('useAIStatus must be used within AIStatusProvider');
  }

  return context;
}
