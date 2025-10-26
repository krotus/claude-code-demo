// ABOUTME: Zod schemas for AI status API response validation
// ABOUTME: Ensures type safety for feature availability data from backend

import { z } from 'zod';

/**
 * Schema for AI provider status
 */
export const AIProviderStatusSchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
  name: z.string(),
});

export type AIProviderStatus = z.infer<typeof AIProviderStatusSchema>;

/**
 * Schema for repository status
 */
export const RepositoryStatusSchema = z.object({
  type: z.enum(['inmemory', 'mongodb']),
  available: z.boolean(),
});

export type RepositoryStatus = z.infer<typeof RepositoryStatusSchema>;

/**
 * Schema for tools status
 */
export const ToolsStatusSchema = z.object({
  count: z.number(),
  weather: z.boolean(),
});

export type ToolsStatus = z.infer<typeof ToolsStatusSchema>;

/**
 * Schema for feature flags
 */
export const FeaturesSchema = z.object({
  aiChat: z.boolean(),
  conversationHistory: z.boolean(),
  weatherTool: z.boolean(),
});

export type Features = z.infer<typeof FeaturesSchema>;

/**
 * Main status response schema
 */
export const AIStatusSchema = z.object({
  features: FeaturesSchema,
  aiProvider: AIProviderStatusSchema,
  repository: RepositoryStatusSchema,
  tools: ToolsStatusSchema,
  timestamp: z.string(),
});

export type AIStatus = z.infer<typeof AIStatusSchema>;
