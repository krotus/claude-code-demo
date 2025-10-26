// ABOUTME: Service layer for fetching AI status from backend API
// ABOUTME: Handles API calls with error handling and response validation

import { AIStatus, AIStatusSchema } from '../schemas/ai-status.schema';

/**
 * Fetches current system status from backend
 *
 * @returns Promise<AIStatus> - System feature availability status
 * @throws Error if fetch fails or response validation fails
 */
export async function fetchAIStatus(): Promise<AIStatus> {
  try {
    const response = await fetch('/api/config/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Always fetch fresh status
    });

    if (!response.ok) {
      throw new Error(`Status endpoint returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response against schema
    const validated = AIStatusSchema.parse(data);

    return validated;

  } catch (error) {
    console.error('[AIStatusService] Failed to fetch AI status:', error);

    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to fetch AI status: ${error.message}`);
    }

    throw new Error('Failed to fetch AI status: Unknown error');
  }
}

/**
 * Checks if AI chat feature is available
 *
 * @returns Promise<boolean> - true if AI chat is enabled
 */
export async function isAIChatAvailable(): Promise<boolean> {
  try {
    const status = await fetchAIStatus();
    return status.features.aiChat;
  } catch (error) {
    console.error('[AIStatusService] Error checking AI chat availability:', error);
    // Fail safely - assume unavailable if check fails
    return false;
  }
}
