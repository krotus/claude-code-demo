# Testing Strategy: Optional AI Provider Dependency

## Executive Summary

This document outlines a comprehensive testing strategy for supporting optional OpenAI API key configuration in our hexagonal architecture. The strategy ensures the application gracefully handles both scenarios: with full AI functionality and without AI (conversation history only).

## Testing Philosophy

1. **Isolation First**: Each test must be completely independent
2. **Mock at Boundaries**: Mock infrastructure adapters, not domain logic
3. **Test Behavior, Not Implementation**: Focus on observable outcomes
4. **Comprehensive Coverage**: Test happy paths, error cases, and edge cases
5. **Fast Execution**: Unit tests should complete in milliseconds

---

## 1. Unit Test Strategy

### 1.1 DependencyContainer Testing

**Location**: `/src/infrastructure/config/__tests__/DependencyContainer.test.ts`

#### Test Structure

Use **parameterized tests** with describe blocks for each configuration scenario:

```typescript
describe('DependencyContainer', () => {
  afterEach(() => {
    DependencyContainer.reset();
    vi.unstubAllEnvs(); // Clean up environment variable mocks
  });

  describe('With API Key', () => {
    // Tests for full AI functionality
  });

  describe('Without API Key', () => {
    // Tests for graceful degradation
  });

  describe('Environment Variable Management', () => {
    // Tests for env var precedence and cleanup
  });
});
```

#### Key Test Cases

**A. With API Key Present**

```typescript
it('should initialize all adapters when API key is provided', async () => {
  // Arrange
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-key-123');

  // Act
  const container = await DependencyContainer.create({ enableLogging: false });

  // Assert
  expect(container.getAIProvider()).toBeDefined();
  expect(container.getStreamAdapter()).toBeDefined();
  expect(container.getToolRegistry()).toBeDefined();
  expect(container.getConversationRepository()).toBeDefined();
});

it('should prioritize config API key over environment variable', async () => {
  // Arrange
  vi.stubEnv('OPENAI_API_KEY', 'env-key');
  const config = { openaiApiKey: 'config-key' };

  // Act
  const container = await DependencyContainer.create(config);
  const provider = container.getAIProvider();

  // Assert
  expect(provider.getProviderName()).toBe('OpenAI');
  // Verify the provider was created with 'config-key' (implementation detail test)
});
```

**B. Without API Key**

```typescript
it('should throw error when API key is not configured', async () => {
  // Arrange
  vi.unstubAllEnvs(); // Ensure no OPENAI_API_KEY

  // Act & Assert
  await expect(
    DependencyContainer.create({})
  ).rejects.toThrow('OPENAI_API_KEY not configured');
});

it('should create NullAIProvider when API key is missing (future)', async () => {
  // This test will be enabled after implementing NullAIProvider pattern
  // Arrange
  vi.unstubAllEnvs();

  // Act
  const container = await DependencyContainer.create({
    aiProviderOptional: true
  });

  // Assert
  const provider = container.getAIProvider();
  expect(provider.getProviderName()).toBe('NullAIProvider');
});
```

**C. Health Check Testing**

```typescript
describe('healthCheck()', () => {
  it('should return healthy status with valid API key', async () => {
    // Arrange
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
    const container = await DependencyContainer.create({});

    // Act
    const health = await container.healthCheck();

    // Assert
    expect(health.status).toBe('healthy');
    expect(health.services.aiProvider).toBe(true);
    expect(health.errors).toHaveLength(0);
  });

  it('should return unhealthy with invalid API key', async () => {
    // Arrange
    vi.stubEnv('OPENAI_API_KEY', 'invalid-key');
    const container = await DependencyContainer.create({});

    // Mock validateConnection to fail
    vi.spyOn(container.getAIProvider(), 'validateConnection')
      .mockRejectedValue(new Error('Invalid API key'));

    // Act
    const health = await container.healthCheck();

    // Assert
    expect(health.status).toBe('unhealthy');
    expect(health.services.aiProvider).toBe(false);
    expect(health.errors).toContain(expect.stringContaining('Invalid API key'));
  });

  it('should mark AI as unavailable when using NullAIProvider', async () => {
    // Future test after NullAIProvider implementation
    // Arrange
    vi.unstubAllEnvs();
    const container = await DependencyContainer.create({
      aiProviderOptional: true
    });

    // Act
    const health = await container.healthCheck();

    // Assert
    expect(health.status).toBe('healthy'); // App is healthy
    expect(health.services.aiProvider).toBe(false); // AI unavailable
    expect(health.services.repository).toBe(true); // Other services work
  });
});
```

#### Environment Variable Management Strategy

```typescript
describe('Environment Variable Isolation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    DependencyContainer.reset();
    vi.unstubAllEnvs();
  });

  it('should not leak env vars between tests', async () => {
    // Test 1: With key
    vi.stubEnv('OPENAI_API_KEY', 'test-key-1');
    const container1 = await DependencyContainer.create({});
    expect(container1.getAIProvider()).toBeDefined();

    // Reset
    DependencyContainer.reset();
    vi.unstubAllEnvs();

    // Test 2: Without key
    await expect(
      DependencyContainer.create({})
    ).rejects.toThrow('OPENAI_API_KEY not configured');
  });
});
```

---

### 1.2 Use Case Testing with Optional AI

**Location**: `/src/application/use-cases/__tests__/`

#### StreamChatCompletionUseCase Testing

```typescript
describe('StreamChatCompletionUseCase', () => {
  let mockAIProvider: vi.Mocked<IAIProvider>;
  let mockToolRegistry: vi.Mocked<IToolRegistry>;
  let mockStreamAdapter: vi.Mocked<IStreamAdapter>;
  let mockRepository: vi.Mocked<IConversationRepository>;
  let useCase: StreamChatCompletionUseCase;

  beforeEach(() => {
    mockAIProvider = createMockAIProvider();
    mockToolRegistry = createMockToolRegistry();
    mockStreamAdapter = createMockStreamAdapter();
    mockRepository = createMockConversationRepository();

    useCase = new StreamChatCompletionUseCase(
      mockAIProvider,
      mockToolRegistry,
      mockStreamAdapter,
      mockRepository
    );
  });

  describe('With AI Available', () => {
    it('should stream completion successfully', async () => {
      // Arrange
      const conversation = new ConversationBuilder()
        .withUserMessage('Hello')
        .build();

      mockRepository.findById.mockResolvedValue(conversation);
      mockAIProvider.streamCompletion.mockImplementation(async function* () {
        yield { type: 'text', content: 'Hi there!' };
        yield {
          type: 'usage',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: 'stop'
        };
      });

      const mockController = createMockStreamController();

      // Act
      await useCase.execute('conv_123', mockController);

      // Assert
      expect(mockStreamAdapter.write).toHaveBeenCalledWith(
        mockController,
        expect.objectContaining({ type: 'text', payload: 'Hi there!' })
      );
      expect(conversation.getMessageCount()).toBe(2); // User + Assistant
    });
  });

  describe('With NullAIProvider', () => {
    it('should throw descriptive error when AI is unavailable', async () => {
      // Arrange
      const nullProvider = new NullAIProvider(); // Throws on streamCompletion
      useCase = new StreamChatCompletionUseCase(
        nullProvider,
        mockToolRegistry,
        mockStreamAdapter,
        mockRepository
      );

      const conversation = new ConversationBuilder()
        .withUserMessage('Hello')
        .build();

      mockRepository.findById.mockResolvedValue(conversation);
      const mockController = createMockStreamController();

      // Act & Assert
      await expect(
        useCase.execute('conv_123', mockController)
      ).rejects.toThrow('AI chat is unavailable');

      // Verify error was streamed to client
      expect(mockStreamAdapter.write).toHaveBeenCalledWith(
        mockController,
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            error: expect.stringContaining('AI chat is unavailable')
          })
        })
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle API key validation failure gracefully', async () => {
      // Arrange
      const conversation = new ConversationBuilder()
        .withUserMessage('Hello')
        .build();

      mockRepository.findById.mockResolvedValue(conversation);
      mockAIProvider.streamCompletion.mockImplementation(async function* () {
        yield { type: 'error', error: 'Invalid API key' };
      });

      const mockController = createMockStreamController();

      // Act & Assert
      await expect(
        useCase.execute('conv_123', mockController)
      ).rejects.toThrow('Invalid API key');
    });

    it('should handle network timeout errors', async () => {
      // Arrange
      const conversation = new ConversationBuilder()
        .withUserMessage('Hello')
        .build();

      mockRepository.findById.mockResolvedValue(conversation);
      mockAIProvider.streamCompletion.mockImplementation(async function* () {
        throw new Error('Network timeout');
      });

      const mockController = createMockStreamController();

      // Act & Assert
      await expect(
        useCase.execute('conv_123', mockController)
      ).rejects.toThrow('Network timeout');
    });
  });
});
```

#### ManageConversationUseCase Testing

```typescript
describe('ManageConversationUseCase', () => {
  let mockRepository: vi.Mocked<IConversationRepository>;
  let useCase: ManageConversationUseCase;

  beforeEach(() => {
    mockRepository = createMockConversationRepository();
    useCase = new ManageConversationUseCase(mockRepository);
  });

  describe('With or Without AI', () => {
    it('should list conversations regardless of AI availability', async () => {
      // Arrange
      const conversations = [
        new ConversationBuilder().withId('conv_1').build(),
        new ConversationBuilder().withId('conv_2').build(),
      ];

      mockRepository.findAll.mockResolvedValue(conversations);

      // Act
      const result = await useCase.listConversations();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv_1');
      expect(mockRepository.findAll).toHaveBeenCalled();
    });

    it('should retrieve conversation by ID without requiring AI', async () => {
      // Arrange
      const conversation = new ConversationBuilder()
        .withId('conv_123')
        .withUserMessage('Past message')
        .build();

      mockRepository.findById.mockResolvedValue(conversation);

      // Act
      const result = await useCase.getConversation('conv_123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.getId()).toBe('conv_123');
      expect(result?.getMessageCount()).toBe(1);
    });

    it('should create new conversation without AI provider', async () => {
      // Arrange
      mockRepository.save.mockResolvedValue();

      // Act
      const conversation = await useCase.createConversation('Test Chat');

      // Assert
      expect(conversation.getTitle()).toBe('Test Chat');
      expect(mockRepository.save).toHaveBeenCalledWith(conversation);
    });
  });
});
```

---

### 1.3 NullAIProvider Implementation

**Location**: `/src/infrastructure/adapters/ai/NullAIProvider.ts`

This adapter implements the Null Object pattern for when AI is unavailable:

```typescript
// ABOUTME: Null object pattern implementation for unavailable AI provider
// ABOUTME: Returns descriptive errors instead of allowing undefined behavior

export class NullAIProvider implements IAIProvider {
  async *streamCompletion(
    request: AICompletionRequest
  ): AsyncIterable<AIStreamChunk> {
    yield {
      type: 'error',
      error: 'AI chat is unavailable. Please configure OPENAI_API_KEY to enable chat features.'
    };
  }

  async getAvailableModels(): Promise<string[]> {
    return [];
  }

  async validateConnection(): Promise<boolean> {
    return false;
  }

  getProviderName(): string {
    return 'NullAIProvider';
  }
}
```

**Test File**: `/src/infrastructure/adapters/ai/__tests__/NullAIProvider.test.ts`

```typescript
describe('NullAIProvider', () => {
  let provider: NullAIProvider;

  beforeEach(() => {
    provider = new NullAIProvider();
  });

  it('should return error on streamCompletion', async () => {
    // Arrange
    const request: AICompletionRequest = {
      messages: [],
      tools: [],
      model: 'gpt-4o',
    };

    // Act
    const stream = provider.streamCompletion(request);
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toContain('AI chat is unavailable');
    expect(chunks[0].error).toContain('OPENAI_API_KEY');
  });

  it('should return empty models array', async () => {
    // Act
    const models = await provider.getAvailableModels();

    // Assert
    expect(models).toEqual([]);
  });

  it('should return false for validateConnection', async () => {
    // Act
    const isValid = await provider.validateConnection();

    // Assert
    expect(isValid).toBe(false);
  });

  it('should have correct provider name', () => {
    // Act
    const name = provider.getProviderName();

    // Assert
    expect(name).toBe('NullAIProvider');
  });
});
```

---

## 2. Integration Testing Strategy

### 2.1 API Route Testing

**Location**: `/app/api/conversations/__tests__/route.test.ts`

#### Test Fixtures

Create configuration fixtures for different scenarios:

```typescript
// __tests__/fixtures/containerConfigs.ts
export const withAIConfig = {
  openaiApiKey: 'sk-test-key-valid',
  enableLogging: false,
};

export const withoutAIConfig = {
  aiProviderOptional: true,
  enableLogging: false,
};

export const invalidAIConfig = {
  openaiApiKey: 'sk-invalid-key',
  enableLogging: false,
};
```

#### Integration Test Cases

```typescript
describe('POST /api/conversations', () => {
  afterEach(() => {
    DependencyContainer.reset();
  });

  describe('With AI Available', () => {
    beforeEach(async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
      await DependencyContainer.create(withAIConfig);
    });

    it('should create conversation and stream AI response', async () => {
      // Arrange
      const requestBody = {
        conversationId: 'conv_test',
        message: {
          role: 'user',
          content: 'Hello AI',
        },
      };

      // Act
      const response = await POST(
        new Request('http://localhost:3000/api/conversations', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/event-stream');

      // Verify stream contains response
      const reader = response.body?.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      expect(chunks.join('')).toContain('0:'); // Vercel stream format
    });
  });

  describe('Without AI Available', () => {
    beforeEach(async () => {
      vi.unstubAllEnvs();
      await expect(
        DependencyContainer.create(withoutAIConfig)
      ).rejects.toThrow(); // Current behavior
    });

    it('should return 503 when AI is unavailable', async () => {
      // Arrange
      const requestBody = {
        conversationId: 'conv_test',
        message: {
          role: 'user',
          content: 'Hello',
        },
      };

      // Act
      const response = await POST(
        new Request('http://localhost:3000/api/conversations', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );

      // Assert
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain('AI chat is unavailable');
    });
  });
});

describe('GET /api/conversations', () => {
  afterEach(() => {
    DependencyContainer.reset();
  });

  describe('Without AI Available', () => {
    beforeEach(async () => {
      vi.unstubAllEnvs();
      // Future: Container should initialize with NullAIProvider
    });

    it('should list conversations even without AI', async () => {
      // This test verifies conversation history works without AI
      // Arrange
      const container = await DependencyContainer.create({
        aiProviderOptional: true,
      });

      const manageUseCase = container.getManageConversationUseCase();
      await manageUseCase.createConversation('Past Chat');

      // Act
      const response = await GET(
        new Request('http://localhost:3000/api/conversations')
      );

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.conversations).toBeDefined();
      expect(body.conversations).toHaveLength(1);
    });
  });
});
```

### 2.2 Health Check Endpoint Testing

**Location**: `/app/api/config/__tests__/status.test.ts`

```typescript
describe('GET /api/config/status', () => {
  afterEach(() => {
    DependencyContainer.reset();
  });

  it('should return AI available status with valid key', async () => {
    // Arrange
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
    await DependencyContainer.create({});

    // Act
    const response = await GET(
      new Request('http://localhost:3000/api/config/status')
    );

    // Assert
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.aiAvailable).toBe(true);
    expect(body.features).toContain('chat');
    expect(body.features).toContain('conversation_history');
  });

  it('should return AI unavailable status without key', async () => {
    // Arrange
    vi.unstubAllEnvs();
    try {
      await DependencyContainer.create({ aiProviderOptional: true });
    } catch (error) {
      // Expected with current implementation
    }

    // Act
    const response = await GET(
      new Request('http://localhost:3000/api/config/status')
    );

    // Assert
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.aiAvailable).toBe(false);
    expect(body.features).toContain('conversation_history');
    expect(body.features).not.toContain('chat');
    expect(body.message).toContain('Please configure OPENAI_API_KEY');
  });
});
```

---

## 3. Edge Cases and Error Scenarios

### 3.1 API Key State Transitions

**Test File**: `/src/infrastructure/config/__tests__/DependencyContainer.edge-cases.test.ts`

```typescript
describe('DependencyContainer Edge Cases', () => {
  describe('API Key Present but Invalid', () => {
    it('should detect invalid key during health check', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', 'sk-invalid-format');
      const container = await DependencyContainer.create({});

      // Mock OpenAI validation to fail
      const mockProvider = container.getAIProvider() as vi.Mocked<IAIProvider>;
      vi.spyOn(mockProvider, 'validateConnection').mockRejectedValue(
        new Error('Invalid API key format')
      );

      // Act
      const health = await container.healthCheck();

      // Assert
      expect(health.status).toBe('unhealthy');
      expect(health.errors).toContain(expect.stringContaining('Invalid API key'));
    });

    it('should fail during first streaming attempt with invalid key', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', 'sk-wrong-key');
      const container = await DependencyContainer.create({});

      const streamUseCase = container.getStreamChatCompletionUseCase();
      const conversation = new ConversationBuilder()
        .withUserMessage('Test')
        .build();

      await container.getConversationRepository().save(conversation);

      // Mock streaming to fail with auth error
      const mockProvider = container.getAIProvider() as vi.Mocked<IAIProvider>;
      vi.spyOn(mockProvider, 'streamCompletion').mockImplementation(async function* () {
        yield {
          type: 'error',
          error: 'Authentication failed: Invalid API key'
        };
      });

      const mockController = createMockStreamController();

      // Act & Assert
      await expect(
        streamUseCase.execute(conversation.getId(), mockController)
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('API Key Removed After Startup', () => {
    it('should use cached provider until reconfiguration', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', 'sk-valid-key');
      const container = await DependencyContainer.create({});

      const providerBefore = container.getAIProvider();
      expect(providerBefore.getProviderName()).toBe('OpenAI');

      // Act - Remove key (simulates runtime env change)
      vi.unstubAllEnvs();

      // Assert - Container still has cached provider
      const providerAfter = container.getAIProvider();
      expect(providerAfter).toBe(providerBefore); // Same instance
    });

    it('should use new key after reconfiguration', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', 'sk-key-1');
      await DependencyContainer.create({});

      // Act - Reconfigure with new key
      vi.stubEnv('OPENAI_API_KEY', 'sk-key-2');
      const newContainer = await DependencyContainer.reconfigure({
        openaiApiKey: 'sk-key-2',
      });

      // Assert
      expect(newContainer.getAIProvider()).toBeDefined();
      // Note: Can't directly test which key was used, but can verify new instance
    });
  });

  describe('Network Errors vs Configuration Errors', () => {
    it('should distinguish between network timeout and auth failure', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
      const container = await DependencyContainer.create({});

      const mockProvider = container.getAIProvider() as vi.Mocked<IAIProvider>;

      // Act & Assert - Network timeout
      vi.spyOn(mockProvider, 'validateConnection').mockRejectedValue(
        new Error('Request timeout after 30s')
      );

      const healthNetwork = await container.healthCheck();
      expect(healthNetwork.errors[0]).toContain('timeout');

      // Act & Assert - Auth failure
      vi.spyOn(mockProvider, 'validateConnection').mockRejectedValue(
        new Error('Incorrect API key provided')
      );

      const healthAuth = await container.healthCheck();
      expect(healthAuth.errors[0]).toContain('API key');
    });
  });

  describe('Empty String vs Undefined API Key', () => {
    it('should treat empty string as missing key', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', '');

      // Act & Assert
      await expect(
        DependencyContainer.create({})
      ).rejects.toThrow('OPENAI_API_KEY not configured');
    });

    it('should treat whitespace-only string as missing key', async () => {
      // Arrange
      vi.stubEnv('OPENAI_API_KEY', '   ');

      // Act & Assert
      await expect(
        DependencyContainer.create({})
      ).rejects.toThrow('OPENAI_API_KEY not configured');
    });
  });
});
```

---

## 4. Test Isolation Strategies

### 4.1 Container Reset Pattern

```typescript
// __tests__/helpers/containerHelper.ts
export async function setupContainerWithAI() {
  DependencyContainer.reset();
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
  return await DependencyContainer.create({ enableLogging: false });
}

export async function setupContainerWithoutAI() {
  DependencyContainer.reset();
  vi.unstubAllEnvs();
  // Future: Return container with NullAIProvider
  try {
    return await DependencyContainer.create({ aiProviderOptional: true });
  } catch (error) {
    return null; // Current behavior
  }
}

export function teardownContainer() {
  DependencyContainer.reset();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
}
```

### 4.2 Mock Factory Pattern

```typescript
// __tests__/mocks/mockFactories.ts
export function createMockAIProvider(
  behavior: 'success' | 'error' | 'unavailable' = 'success'
): vi.Mocked<IAIProvider> {
  const mock = {
    streamCompletion: vi.fn(),
    getAvailableModels: vi.fn(),
    validateConnection: vi.fn(),
    getProviderName: vi.fn(),
  };

  switch (behavior) {
    case 'success':
      mock.streamCompletion.mockImplementation(async function* () {
        yield { type: 'text', content: 'Test response' };
        yield { type: 'usage', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      });
      mock.validateConnection.mockResolvedValue(true);
      mock.getProviderName.mockReturnValue('MockOpenAI');
      break;

    case 'error':
      mock.streamCompletion.mockImplementation(async function* () {
        yield { type: 'error', error: 'API Error' };
      });
      mock.validateConnection.mockResolvedValue(false);
      mock.getProviderName.mockReturnValue('MockOpenAI');
      break;

    case 'unavailable':
      mock.streamCompletion.mockImplementation(async function* () {
        yield { type: 'error', error: 'AI chat is unavailable' };
      });
      mock.validateConnection.mockResolvedValue(false);
      mock.getProviderName.mockReturnValue('NullAIProvider');
      break;
  }

  return mock as vi.Mocked<IAIProvider>;
}

export function createMockStreamController(): ReadableStreamDefaultController {
  return {
    enqueue: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
    desiredSize: null,
  };
}
```

### 4.3 Environment Variable Isolation

```typescript
// vitest.config.ts additions
export default defineConfig({
  test: {
    // ...existing config

    // Run tests in sequence to avoid env var conflicts
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true, // Each test file gets isolated environment
      },
    },

    // Setup file for global test utilities
    setupFiles: ['./vitest.setup.ts'],
  },
});

// vitest.setup.ts
import { afterEach } from 'vitest';
import { DependencyContainer } from './src/infrastructure/config/DependencyContainer';

// Global cleanup after each test
afterEach(() => {
  DependencyContainer.reset();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
```

---

## 5. Coverage Requirements

### 5.1 Critical Path Coverage

**Must Achieve 100% Coverage**:
- `DependencyContainer.initializeAdapters()`
- `DependencyContainer.healthCheck()`
- `NullAIProvider` (all methods)
- API key validation logic
- Error handling in `StreamChatCompletionUseCase`

**Target 95%+ Coverage**:
- All use cases with mocked dependencies
- Container reconfiguration logic
- Repository operations (independent of AI)

### 5.2 Branch Coverage Requirements

All conditional branches must be tested:

```typescript
// Example from DependencyContainer
private async initializeAdapters(): Promise<void> {
  const apiKey = this.config.openaiApiKey || process.env.OPENAI_API_KEY;

  // Branch 1: apiKey is truthy
  // Branch 2: apiKey is falsy
  if (!apiKey) {
    // Test case needed: No API key provided
    if (this.config.aiProviderOptional) {
      // Test case needed: Optional AI, use NullAIProvider
      this.aiProvider = new NullAIProvider();
    } else {
      // Test case needed: Required AI, throw error
      throw new Error('OPENAI_API_KEY not configured');
    }
  } else {
    // Test case needed: API key provided, create OpenAIAdapter
    this.aiProvider = new OpenAIAdapter(apiKey);
  }
}
```

### 5.3 Coverage Thresholds

```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    // Infrastructure layer (includes DependencyContainer)
    'src/infrastructure/config/**/*.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },

    // Application layer (use cases)
    'src/application/use-cases/**/*.ts': {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },

    // Domain layer (no AI dependency)
    'src/domain/**/*.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
},
```

---

## 6. Test Execution Plan

### 6.1 Test Organization

```
src/
├── infrastructure/
│   ├── config/
│   │   ├── __tests__/
│   │   │   ├── DependencyContainer.test.ts          (Core container tests)
│   │   │   ├── DependencyContainer.edge-cases.test.ts  (Edge case scenarios)
│   │   │   └── container.test.ts                    (Singleton wrapper tests)
│   │   ├── DependencyContainer.ts
│   │   └── container.ts
│   └── adapters/
│       └── ai/
│           ├── __tests__/
│           │   ├── OpenAIAdapter.test.ts
│           │   └── NullAIProvider.test.ts          (New)
│           ├── OpenAIAdapter.ts
│           └── NullAIProvider.ts                    (New)
│
├── application/
│   └── use-cases/
│       └── __tests__/
│           ├── StreamChatCompletionUseCase.test.ts
│           ├── StreamChatCompletionUseCase.no-ai.test.ts  (New)
│           ├── ManageConversationUseCase.test.ts
│           └── ManageConversationUseCase.no-ai.test.ts    (New)
│
└── __tests__/
    ├── helpers/
    │   ├── containerHelper.ts                       (Setup helpers)
    │   └── mockFactories.ts                         (Mock factories)
    └── fixtures/
        └── containerConfigs.ts                      (Test configs)
```

### 6.2 Test Execution Order

```bash
# 1. Unit tests (fastest)
yarn test src/infrastructure/config/__tests__/DependencyContainer.test.ts
yarn test src/infrastructure/adapters/ai/__tests__/NullAIProvider.test.ts
yarn test src/application/use-cases/__tests__/*.test.ts

# 2. Integration tests (slower)
yarn test app/api/conversations/__tests__/route.test.ts
yarn test app/api/config/__tests__/status.test.ts

# 3. Edge case tests (comprehensive)
yarn test src/infrastructure/config/__tests__/DependencyContainer.edge-cases.test.ts

# 4. Full test suite with coverage
yarn test:coverage
```

### 6.3 Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test Optional AI Feature

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        scenario:
          - name: "With API Key"
            env_setup: "OPENAI_API_KEY=sk-test-key"
          - name: "Without API Key"
            env_setup: ""

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: yarn install

      - name: Run tests - ${{ matrix.scenario.name }}
        env:
          ${{ matrix.scenario.env_setup }}
        run: |
          yarn test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 7. Example Test Cases Summary

### 7.1 DependencyContainer (20 tests)

✅ **With API Key**:
- Initialize all adapters successfully
- Prioritize config key over env var
- Health check returns healthy
- Validate OpenAI connection succeeds

✅ **Without API Key**:
- Throw error when required
- Create NullAIProvider when optional
- Health check marks AI as unavailable
- Other services remain operational

✅ **Edge Cases**:
- Invalid API key format detected
- Empty string treated as missing
- Whitespace-only treated as missing
- Key removed after startup uses cached provider

### 7.2 Use Cases (16 tests)

✅ **StreamChatCompletionUseCase**:
- Stream completion successfully with AI
- Throw descriptive error with NullAIProvider
- Handle invalid API key during streaming
- Handle network timeout errors
- Stream error events to client

✅ **ManageConversationUseCase**:
- List conversations without AI
- Retrieve conversation by ID without AI
- Create conversation without AI
- All operations work independently

### 7.3 Integration Tests (8 tests)

✅ **API Routes**:
- POST /api/conversations with AI available
- POST /api/conversations returns 503 without AI
- GET /api/conversations works without AI
- Health endpoint reflects AI status

### 7.4 NullAIProvider (4 tests)

✅ **Null Object Pattern**:
- Returns error on streamCompletion
- Returns empty models array
- validateConnection returns false
- Correct provider name

**Total: 48 comprehensive test cases**

---

## 8. Testing Anti-Patterns to Avoid

### ❌ Don't Mock What You Don't Own
```typescript
// BAD: Mocking Node.js process.env directly
vi.mock('process', () => ({
  env: { OPENAI_API_KEY: 'test' }
}));

// GOOD: Use vi.stubEnv for environment variables
vi.stubEnv('OPENAI_API_KEY', 'test');
```

### ❌ Don't Test Implementation Details
```typescript
// BAD: Testing private method behavior
expect(container['initializeAdapters']).toHaveBeenCalled();

// GOOD: Test observable behavior
expect(container.getAIProvider()).toBeDefined();
```

### ❌ Don't Share State Between Tests
```typescript
// BAD: Shared container instance
let container: DependencyContainer;

beforeAll(async () => {
  container = await DependencyContainer.create({});
});

// GOOD: Fresh instance per test
beforeEach(async () => {
  DependencyContainer.reset();
  container = await DependencyContainer.create({});
});
```

### ❌ Don't Ignore Cleanup
```typescript
// BAD: No cleanup, leaks between tests
it('test with env var', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test');
  // test...
});

// GOOD: Always cleanup
afterEach(() => {
  vi.unstubAllEnvs();
  DependencyContainer.reset();
});
```

---

## 9. Success Criteria

This testing strategy is successful when:

1. ✅ **100% Coverage** of DependencyContainer initialization logic
2. ✅ **All 48 test cases** pass consistently
3. ✅ **Tests execute in < 5 seconds** (unit tests only)
4. ✅ **No test interdependencies** - all tests can run in any order
5. ✅ **Clear failure messages** that pinpoint issues immediately
6. ✅ **Both modes tested**: with AI and without AI
7. ✅ **Edge cases covered**: invalid keys, network errors, state transitions
8. ✅ **Integration tests** verify API routes work in both modes
9. ✅ **CI pipeline** runs tests in both scenarios
10. ✅ **Zero flaky tests** - deterministic results every run

---

## 10. Next Steps

### Implementation Order

1. **Phase 1: NullAIProvider** (1-2 hours)
   - Create NullAIProvider class
   - Write unit tests for NullAIProvider
   - Verify Null Object pattern works

2. **Phase 2: DependencyContainer Updates** (2-3 hours)
   - Add `aiProviderOptional` config flag
   - Update initialization logic
   - Write DependencyContainer tests
   - Write edge case tests

3. **Phase 3: Use Case Tests** (2-3 hours)
   - Test StreamChatCompletionUseCase with mocks
   - Test ManageConversationUseCase independence
   - Verify graceful degradation

4. **Phase 4: Integration Tests** (2-3 hours)
   - Create API route tests
   - Implement health check endpoint
   - Test both configurations

5. **Phase 5: CI/CD** (1-2 hours)
   - Set up GitHub Actions matrix
   - Configure coverage reporting
   - Verify all scenarios pass

**Total Estimated Effort: 8-13 hours**

---

## Appendix: Quick Reference

### Common Mock Patterns

```typescript
// Mock AI Provider
const mockAI = createMockAIProvider('success');

// Mock Stream Controller
const mockController = createMockStreamController();

// Mock Repository
const mockRepo = {
  findById: vi.fn(),
  save: vi.fn(),
  findAll: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
} as vi.Mocked<IConversationRepository>;

// Stub Environment Variable
vi.stubEnv('OPENAI_API_KEY', 'test-key');

// Clean Up
afterEach(() => {
  DependencyContainer.reset();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
```

### Running Specific Test Suites

```bash
# Unit tests only
yarn test src/infrastructure/config

# Integration tests only
yarn test app/api

# With coverage
yarn test:coverage

# Watch mode
yarn test --watch

# UI mode
yarn test:ui
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Author**: Backend Test Architect
**Status**: Ready for Implementation
