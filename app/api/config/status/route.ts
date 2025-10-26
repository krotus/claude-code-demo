// ABOUTME: Status endpoint exposing feature availability for frontend toggles
// ABOUTME: Returns AI provider status, repository type, and enabled features

import { NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/src/infrastructure/config/container';
import { ToolName } from '@/domain/value-objects/ToolName';

/**
 * GET /api/config/status
 *
 * Returns the current status of system features for frontend feature toggles.
 * This is separate from /api/conversations (health check) which is for ops monitoring.
 *
 * Response:
 * {
 *   features: {
 *     aiChat: boolean,
 *     conversationHistory: boolean,
 *     weatherTool: boolean
 *   },
 *   aiProvider: {
 *     configured: boolean,
 *     available: boolean,
 *     name: string
 *   },
 *   repository: {
 *     type: string,
 *     available: boolean
 *   },
 *   timestamp: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const container = await getContainer();

    // Get AI provider status
    const aiProvider = container.getAIProvider();
    const aiAvailable = await aiProvider.validateConnection();
    const aiProviderName = aiProvider.getProviderName();

    // Get repository info
    const repository = container.getConversationRepository();
    let repositoryType = 'inmemory'; // default
    let repositoryAvailable = true;

    try {
      // Test repository connectivity
      await repository.count();

      // Determine repository type from class name
      const repoClassName = repository.constructor.name;
      if (repoClassName.includes('MongoDB')) {
        repositoryType = 'mongodb';
      }
    } catch (error) {
      console.error('[Status] Repository check failed:', error);
      repositoryAvailable = false;
    }

    // Get tool registry status
    const toolRegistry = container.getToolRegistry();
    const toolCount = toolRegistry.count();
    const weatherToolName = ToolName.from('get_current_weather');
    const weatherToolAvailable = toolRegistry.getTool(weatherToolName) !== undefined;

    // Build response
    const response = {
      features: {
        aiChat: aiAvailable,
        conversationHistory: repositoryAvailable,
        weatherTool: weatherToolAvailable,
      },
      aiProvider: {
        configured: aiAvailable,
        available: aiAvailable,
        name: aiProviderName,
      },
      repository: {
        type: repositoryType,
        available: repositoryAvailable,
      },
      tools: {
        count: toolCount,
        weather: weatherToolAvailable,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });

  } catch (error) {
    console.error('[Status] Endpoint error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve system status',
        message: process.env.NODE_ENV === 'development'
          ? (error as Error).message
          : undefined,
      },
      { status: 500 }
    );
  }
}
