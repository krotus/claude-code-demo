// ABOUTME: Unit tests for NullAIProvider null object implementation
// ABOUTME: Verifies safe no-op behavior when OpenAI is not configured

import { describe, it, expect } from 'vitest';
import { NullAIProvider } from '../NullAIProvider';
import { Message } from '../../../../domain/entities/Message';
import { MessageRole } from '../../../../domain/value-objects/MessageRole';
import { MessageContent } from '../../../../domain/value-objects/MessageContent';

describe('NullAIProvider', () => {
  describe('streamCompletion', () => {
    it('should yield a single error chunk with user-friendly message', async () => {
      // Arrange
      const provider = new NullAIProvider();
      const message = Message.create(
        MessageRole.user(),
        MessageContent.from('Hello')
      );

      const request = {
        messages: [message],
        tools: [],
        model: 'gpt-4o',
      };

      // Act
      const chunks = [];
      for await (const chunk of provider.streamCompletion(request)) {
        chunks.push(chunk);
      }

      // Assert
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'error',
        error: expect.stringContaining('AI chat is currently unavailable'),
      });
      expect(chunks[0].error).toContain('OPENAI_API_KEY');
      expect(chunks[0].error).toContain('https://platform.openai.com/api-keys');
    });

    it('should not throw exceptions when called', async () => {
      // Arrange
      const provider = new NullAIProvider();
      const request = {
        messages: [],
        tools: [],
        model: 'gpt-4o',
      };

      // Act & Assert - should not throw
      const streamPromise = (async () => {
        for await (const _chunk of provider.streamCompletion(request)) {
          // Consume the stream
        }
      })();

      await expect(streamPromise).resolves.not.toThrow();
    });
  });

  describe('getAvailableModels', () => {
    it('should return empty array', async () => {
      // Arrange
      const provider = new NullAIProvider();

      // Act
      const models = await provider.getAvailableModels();

      // Assert
      expect(models).toEqual([]);
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('validateConnection', () => {
    it('should always return false', async () => {
      // Arrange
      const provider = new NullAIProvider();

      // Act
      const isValid = await provider.validateConnection();

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return descriptive name indicating AI is not configured', () => {
      // Arrange
      const provider = new NullAIProvider();

      // Act
      const name = provider.getProviderName();

      // Assert
      expect(name).toBe('None (AI Provider Not Configured)');
    });
  });

  describe('interface compliance', () => {
    it('should implement IAIProvider interface completely', () => {
      // Arrange
      const provider = new NullAIProvider();

      // Assert - verify all required methods exist
      expect(typeof provider.streamCompletion).toBe('function');
      expect(typeof provider.getAvailableModels).toBe('function');
      expect(typeof provider.validateConnection).toBe('function');
      expect(typeof provider.getProviderName).toBe('function');
    });
  });
});
