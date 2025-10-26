// ABOUTME: Null Object Pattern implementation for IAIProvider when OpenAI is unavailable
// ABOUTME: Provides safe no-op behavior and user-friendly error messages via streaming protocol

import { IAIProvider, AICompletionRequest, AIStreamChunk } from '../../../application/ports/outbound/IAIProvider';

/**
 * NullAIProvider implements IAIProvider with safe no-op behavior.
 * Used when OPENAI_API_KEY is not configured, allowing the application
 * to gracefully degrade while maintaining clean architecture principles.
 *
 * Key behaviors:
 * - streamCompletion() yields error chunks (doesn't throw)
 * - validateConnection() always returns false
 * - getAvailableModels() returns empty array
 * - getProviderName() returns descriptive name
 *
 * This follows the NullObject pattern to eliminate null checks throughout
 * the codebase while providing predictable, safe behavior.
 */
export class NullAIProvider implements IAIProvider {
  private readonly errorMessage =
    'AI chat is currently unavailable. Please configure your OPENAI_API_KEY environment variable to enable chat features. ' +
    'Visit https://platform.openai.com/api-keys to get your API key.';

  /**
   * Yields a single error chunk explaining AI is unavailable.
   * Does not throw exceptions - communicates via streaming protocol.
   */
  async *streamCompletion(request: AICompletionRequest): AsyncIterable<AIStreamChunk> {
    yield {
      type: 'error',
      error: this.errorMessage,
    };
  }

  /**
   * Always returns empty array since no AI models are available.
   */
  async getAvailableModels(): Promise<string[]> {
    return [];
  }

  /**
   * Always returns false since AI provider is not configured.
   */
  async validateConnection(): Promise<boolean> {
    return false;
  }

  /**
   * Returns descriptive name indicating AI is not configured.
   */
  getProviderName(): string {
    return 'None (AI Provider Not Configured)';
  }
}
