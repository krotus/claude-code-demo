// ABOUTME: Warning banner displayed when AI chat features are unavailable
// ABOUTME: Provides user-friendly message with links to setup instructions

'use client';

import React from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Banner component displayed when AI features are unavailable
 *
 * Shows when OPENAI_API_KEY is not configured, with:
 * - Clear explanation of why chat is unavailable
 * - Link to get API key
 * - Link to setup instructions (if provided)
 *
 * @example
 * {!isAIChatAvailable && <AIUnavailableBanner />}
 */
export function AIUnavailableBanner() {
  const handleGetAPIKey = () => {
    window.open('https://platform.openai.com/api-keys', '_blank', 'noopener,noreferrer');
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>AI Chat Currently Unavailable</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>
          AI chat features are currently disabled. Please configure your <code className="bg-muted px-1 py-0.5 rounded text-xs">OPENAI_API_KEY</code> environment variable to enable chat functionality.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGetAPIKey}
            className="text-xs"
          >
            Get API Key
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          You can still view your conversation history, but cannot send new messages until AI is configured.
        </p>
      </AlertDescription>
    </Alert>
  );
}
