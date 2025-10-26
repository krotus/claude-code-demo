# Frontend Implementation Plan: Graceful AI Feature Degradation

## Overview
This document outlines the frontend implementation for gracefully handling disabled AI features when `OPENAI_API_KEY` is not configured. The implementation follows the feature-based architecture with React Query hooks, Zod schemas, and context-based state management.

## Architecture Decision: React Context for AI Status

### Why React Context?
1. **Global State**: AI availability status needs to be accessible throughout the app (chat input, sidebar, navbar)
2. **Single Source of Truth**: One status check on mount, shared everywhere
3. **Reactive Updates**: Context ensures all UI components update when status changes
4. **Feature-Level State**: Aligns with our pattern of using context for feature-level concerns (like auth)
5. **No External Library Needed**: React Context is sufficient for this use case

### Implementation Strategy
We'll create a new feature: `ai-status` with:
- Service layer for health check API calls
- Zod schemas for validation
- React Query hook for status fetching
- React Context for status distribution
- Custom hook for easy consumption

---

## File Structure

```
app/features/ai-status/
├── data/
│   ├── services/
│   │   └── ai-status.service.ts       # API communication layer
│   └── schemas/
│       └── ai-status.schema.ts        # Zod schemas for validation
├── hooks/
│   ├── queries/
│   │   └── useAIStatusQuery.ts        # React Query hook
│   └── useAIStatusContext.tsx         # Context + consumer hook
└── components/
    ├── ai-status-provider.tsx         # Context provider component
    └── ai-unavailable-banner.tsx      # UI component for unavailable state
```

---

## Implementation Plan

### Phase 1: Schema Definition (ai-status.schema.ts)

**File**: `/home/andreu/Projects/claude-code-demo/app/features/ai-status/data/schemas/ai-status.schema.ts`

```typescript
// ABOUTME: Zod schemas for AI status validation and type inference
// ABOUTME: Provides runtime validation and TypeScript types for AI availability

import { z } from 'zod';

/**
 * Schema for AI status response from health check endpoint
 */
export const AIStatusSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
});

/**
 * Schema for AI status error response
 */
export const AIStatusErrorSchema = z.object({
  available: z.literal(false),
  reason: z.string(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
});

/**
 * TypeScript types inferred from schemas
 */
export type AIStatus = z.infer<typeof AIStatusSchema>;
export type AIStatusError = z.infer<typeof AIStatusErrorSchema>;
```

**Key Points**:
- Simple boolean `available` flag
- Optional `reason` field for debugging/logging
- `timestamp` for cache validation
- Error schema for failure cases

---

### Phase 2: Service Layer (ai-status.service.ts)

**File**: `/home/andreu/Projects/claude-code-demo/app/features/ai-status/data/services/ai-status.service.ts`

```typescript
// ABOUTME: Service layer for AI status health check API communication
// ABOUTME: Handles HTTP requests for checking AI provider availability

import axios, { AxiosInstance } from 'axios';
import { AIStatusSchema, type AIStatus } from '../schemas/ai-status.schema';

export class AIStatusServiceError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AIStatusServiceError';
  }
}

/**
 * AI Status service for health check API communication
 */
export class AIStatusService {
  private static axiosInstance: AxiosInstance = axios.create({
    baseURL: '/api',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 5000, // 5s timeout for health checks
  });

  /**
   * Check if AI features are available
   * Calls GET /api/config/status endpoint
   */
  static async checkAIStatus(): Promise<AIStatus> {
    try {
      const response = await this.axiosInstance.get<AIStatus>('/config/status');

      // Validate response with schema
      const validatedStatus = AIStatusSchema.parse(response.data);

      return validatedStatus;
    } catch (error) {
      // On any error, assume AI is unavailable
      console.error('AI status check failed:', error);

      return {
        available: false,
        reason: 'Health check failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
```

**Key Points**:
- 5-second timeout for health checks (fast fail)
- Schema validation on response
- Fail-safe: On error, return `available: false`
- No exceptions thrown - always returns status object

---

### Phase 3: React Query Hook (useAIStatusQuery.ts)

**File**: `/home/andreu/Projects/claude-code-demo/app/features/ai-status/hooks/queries/useAIStatusQuery.ts`

```typescript
// ABOUTME: React Query hook for fetching AI status
// ABOUTME: Provides cached AI availability status with background refetching

import { useQuery } from '@tanstack/react-query';
import { AIStatusService } from '../../data/services/ai-status.service';

/**
 * Query key factory for AI status queries
 */
export const aiStatusKeys = {
  all: ['ai-status'] as const,
  status: () => [...aiStatusKeys.all, 'status'] as const,
};

/**
 * Hook to check AI provider availability
 * Called on app mount and periodically in background
 */
export function useAIStatusQuery() {
  return useQuery({
    queryKey: aiStatusKeys.status(),
    queryFn: () => AIStatusService.checkAIStatus(),
    staleTime: 1000 * 60 * 5, // 5 minutes - status doesn't change often
    gcTime: Infinity, // Never garbage collect - needed throughout session
    retry: 1, // Only retry once on failure
    refetchOnMount: false, // Don't refetch every mount
    refetchOnWindowFocus: true, // Check when user returns to tab
    refetchInterval: 1000 * 60 * 10, // Recheck every 10 minutes
  });
}
```

**Key Points**:
- Query runs on app startup (via provider)
- Long stale time (5 minutes) - status rarely changes
- Refetch on window focus (user returns to tab)
- Background refetch every 10 minutes
- Single retry on failure

---

### Phase 4: Context Implementation (useAIStatusContext.tsx)

**File**: `/home/andreu/Projects/claude-code-demo/app/features/ai-status/hooks/useAIStatusContext.tsx`

```typescript
// ABOUTME: React Context for AI status state management
// ABOUTME: Provides global access to AI availability throughout the app

import { createContext, useContext, type ReactNode } from 'react';
import { useAIStatusQuery } from './queries/useAIStatusQuery';
import type { AIStatus } from '../data/schemas/ai-status.schema';

/**
 * Context value shape
 */
interface AIStatusContextValue {
  // Status data
  isAIAvailable: boolean;
  aiStatus: AIStatus | undefined;

  // Loading states
  isLoading: boolean;
  isError: boolean;

  // Operations
  refetch: () => void;
}

/**
 * Create the context
 */
const AIStatusContext = createContext<AIStatusContextValue | undefined>(undefined);

/**
 * Provider component props
 */
interface AIStatusProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the app
 * Fetches AI status on mount and provides it to all children
 */
export function AIStatusProvider({ children }: AIStatusProviderProps) {
  const query = useAIStatusQuery();

  const contextValue: AIStatusContextValue = {
    // Derived state
    isAIAvailable: query.data?.available ?? false,
    aiStatus: query.data,

    // Loading states
    isLoading: query.isLoading,
    isError: query.isError,

    // Operations
    refetch: query.refetch,
  };

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  );
}

/**
 * Hook to consume AI status context
 * Use this in any component that needs to know AI availability
 */
export function useAIStatus() {
  const context = useContext(AIStatusContext);

  if (context === undefined) {
    throw new Error('useAIStatus must be used within AIStatusProvider');
  }

  return context;
}
```

**Key Points**:
- Simple boolean `isAIAvailable` for easy consumption
- Full `aiStatus` object for debugging
- Loading and error states exposed
- `refetch` function for manual refresh
- Type-safe with TypeScript
- Error if used outside provider

---

### Phase 5: Provider Component Setup

**Modification**: `/home/andreu/Projects/claude-code-demo/app/layout.tsx`

**Changes**:
```typescript
import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { AIStatusProvider } from "@/app/features/ai-status/hooks/useAIStatusContext"; // NEW

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head></head>
      <body className={cn(GeistSans.className, "antialiased")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AIStatusProvider> {/* NEW: Wrap app with AI status provider */}
            <Toaster position="top-center" richColors />
            <Navbar />
            {children}
          </AIStatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Key Points**:
- Wrap entire app with `AIStatusProvider`
- AI status fetched once on mount
- Available to all components via `useAIStatus()` hook

---

### Phase 6: Unavailable Banner Component

**File**: `/home/andreu/Projects/claude-code-demo/app/features/ai-status/components/ai-unavailable-banner.tsx`

```typescript
// ABOUTME: Banner component displayed when AI features are unavailable
// ABOUTME: Shows user-friendly message with setup instructions

import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAIStatus } from '../hooks/useAIStatusContext';

export function AIUnavailableBanner() {
  const { isAIAvailable, isLoading } = useAIStatus();

  // Don't show banner if AI is available or still loading
  if (isAIAvailable || isLoading) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>AI Chat Unavailable</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          AI chat is currently unavailable. Please configure your OpenAI API key to enable chat features.
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://platform.openai.com/api-keys', '_blank')}
          >
            Get API Key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/docs/setup', '_blank')}
          >
            Setup Guide
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

**Key Points**:
- Uses shadcn `Alert` component with destructive variant
- Only renders when AI is unavailable
- Shows helpful message and action buttons
- Links to OpenAI API key page
- Links to setup documentation

**Color Scheme** (from globals.css):
- Uses `--destructive` and `--destructive-foreground` CSS variables
- Light mode: `--destructive: 0 84.2% 60.2%` (red)
- Dark mode: `--destructive: 0 62.8% 30.6%` (darker red)

---

### Phase 7: Chat Input Modifications

**Modification**: `/home/andreu/Projects/claude-code-demo/app/features/conversation/components/multimodal-input.tsx`

**Changes**:
```typescript
import { useAIStatus } from '@/app/features/ai-status/hooks/useAIStatusContext'; // NEW

export function MultimodalInput({
  // ... existing props
}: {
  // ... existing prop types
}) {
  const { isAIAvailable } = useAIStatus(); // NEW

  // ... existing code

  return (
    <div className="relative w-full flex flex-col gap-4">
      {/* Hide suggested actions if AI unavailable */}
      {messages.length === 0 && isAIAvailable && ( // MODIFIED
        <div className="grid sm:grid-cols-2 gap-2 w-full">
          {/* ... existing suggested actions */}
        </div>
      )}

      <Textarea
        ref={textareaRef}
        placeholder={
          isAIAvailable
            ? "Send a message..."
            : "AI chat is unavailable. Please configure OPENAI_API_KEY."
        } // MODIFIED
        value={input}
        onChange={handleInput}
        disabled={!isAIAvailable} // NEW: Disable input when AI unavailable
        className={cn(
          "min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-xl !text-base bg-muted",
          !isAIAvailable && "cursor-not-allowed opacity-60", // NEW: Visual feedback
          className,
        )}
        // ... rest of textarea props
      />

      {/* Disable submit/stop buttons when AI unavailable */}
      {isLoading ? (
        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 border dark:border-zinc-600"
          onClick={(event) => {
            event.preventDefault();
            stop();
            setMessages((messages) => sanitizeUIMessages(messages));
          }}
          disabled={!isAIAvailable} // NEW
        >
          <StopIcon size={14} />
        </Button>
      ) : (
        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 border dark:border-zinc-600"
          onClick={(event) => {
            event.preventDefault();
            submitForm();
          }}
          disabled={input.length === 0 || !isAIAvailable} // MODIFIED
        >
          <ArrowUpIcon size={14} />
        </Button>
      )}
    </div>
  );
}
```

**Key Points**:
- Disable textarea when AI unavailable
- Change placeholder text to inform user
- Add visual feedback (opacity, cursor styles)
- Disable submit/stop buttons
- Hide suggested actions when unavailable

---

### Phase 8: Chat Container Modifications

**Modification**: `/home/andreu/Projects/claude-code-demo/app/features/conversation/components/chat.tsx`

**Changes**:
```typescript
import { AIUnavailableBanner } from '@/app/features/ai-status/components/ai-unavailable-banner'; // NEW

export function Chat({
  // ... existing props
}: ChatProps) {
  return (
    <div className="flex flex-col min-w-0 h-[calc(100dvh-52px)] bg-background">
      <div
        ref={messagesContainerRef}
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
      >
        {/* Show banner at top of chat when AI unavailable */}
        <div className="px-4">
          <AIUnavailableBanner /> {/* NEW */}
        </div>

        {isEmpty && <Overview />}

        {messages.map((message: Message, index: number) => (
          <PreviewMessage
            key={message.id}
            chatId={conversationId}
            message={message}
            isLoading={isLoading && messages.length - 1 === index}
          />
        ))}

        {isThinking && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>

      {/* ... rest of component */}
    </div>
  );
}
```

**Key Points**:
- Banner displayed at top of chat area
- Wrapped in padding div for consistent spacing
- Banner auto-hides when AI is available
- Scrollable with rest of chat content

---

### Phase 9: Sidebar Modifications (Optional Enhancement)

**Modification**: `/home/andreu/Projects/claude-code-demo/app/features/conversation/components/conversation-sidebar.tsx`

**Changes**:
```typescript
import { useAIStatus } from '@/app/features/ai-status/hooks/useAIStatusContext'; // NEW
import { AlertCircle } from 'lucide-react'; // NEW

export function ConversationSidebar({
  onNewConversation,
  onConversationSelect,
}: ConversationSidebarProps) {
  const { isAIAvailable } = useAIStatus(); // NEW

  // ... existing code

  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Button
            onClick={handleNewConversation}
            className="w-full"
            size="lg"
            disabled={!isAIAvailable} // NEW: Disable when AI unavailable
          >
            <Plus className="h-5 w-5 mr-2" />
            New Chat
          </Button>

          {/* Show indicator when AI unavailable */}
          {!isAIAvailable && ( // NEW
            <div className="flex items-center gap-2 text-xs text-destructive mt-2">
              <AlertCircle className="h-3 w-3" />
              <span>AI currently unavailable</span>
            </div>
          )}

          <Separator className="mt-4" />
        </SidebarHeader>

        {/* Conversation list - still accessible in read-only mode */}
        <SidebarContent>
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId || undefined}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onConversationClick={handleConversationClick}
            onConversationDelete={setConversationToDelete}
            onRetry={refetch}
          />
        </SidebarContent>

        <SidebarFooter className="p-4">
          <p className="text-xs text-muted-foreground text-center">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </SidebarFooter>
      </Sidebar>

      {/* ... rest of component */}
    </>
  );
}
```

**Key Points**:
- Disable "New Chat" button when AI unavailable
- Show small indicator below button
- Conversation list remains functional (view-only)
- Users can still browse past conversations

---

## UI/UX Flow Diagrams

### Startup Flow
```
1. User opens app
   ↓
2. RootLayout renders
   ↓
3. AIStatusProvider initializes
   ↓
4. useAIStatusQuery runs
   ↓
5. API call to /api/config/status
   ↓
6. Status cached in React Query
   ↓
7. All components receive status via context
```

### AI Available Flow
```
User visits chat page
   ↓
useAIStatus() → isAIAvailable: true
   ↓
Banner: Hidden
Input: Enabled
Suggested Actions: Visible
New Chat Button: Enabled
   ↓
User can chat normally
```

### AI Unavailable Flow
```
User visits chat page
   ↓
useAIStatus() → isAIAvailable: false
   ↓
Banner: Visible (with setup instructions)
Input: Disabled (grayed out, helpful placeholder)
Suggested Actions: Hidden
New Chat Button: Disabled
   ↓
User can view conversation history
User cannot send new messages
```

### Background Refresh Flow
```
App running (user idle)
   ↓
Every 10 minutes:
  - useAIStatusQuery refetches
  - Updates context value
  - All components re-render if status changed
   ↓
User returns to tab:
  - refetchOnWindowFocus triggers
  - Fresh status check
```

---

## Error Message Copy

### Banner (AI Unavailable)
```
Title: "AI Chat Unavailable"
Body: "AI chat is currently unavailable. Please configure your OpenAI API key to enable chat features."
Actions: [Get API Key] [Setup Guide]
```

### Input Placeholder (AI Unavailable)
```
"AI chat is unavailable. Please configure OPENAI_API_KEY."
```

### Sidebar Indicator (AI Unavailable)
```
"AI currently unavailable"
```

---

## Integration Summary

### New Files Created (7 files)
1. `app/features/ai-status/data/schemas/ai-status.schema.ts` - Zod schemas
2. `app/features/ai-status/data/services/ai-status.service.ts` - API service
3. `app/features/ai-status/hooks/queries/useAIStatusQuery.ts` - React Query hook
4. `app/features/ai-status/hooks/useAIStatusContext.tsx` - Context + consumer hook
5. `app/features/ai-status/components/ai-unavailable-banner.tsx` - Banner component

### Files Modified (4 files)
1. `app/layout.tsx` - Add AIStatusProvider wrapper
2. `app/features/conversation/components/multimodal-input.tsx` - Disable input
3. `app/features/conversation/components/chat.tsx` - Add banner
4. `app/features/conversation/components/conversation-sidebar.tsx` - Disable new chat button

---

## State Management Approach

### Why This Architecture?
1. **Feature Isolation**: AI status is a separate feature with clear boundaries
2. **Reusability**: `useAIStatus()` hook can be used anywhere
3. **Performance**: Single query, cached and shared across all components
4. **Type Safety**: Full TypeScript support with Zod validation
5. **Testability**: Each layer can be tested independently
6. **Consistency**: Follows existing patterns (schemas → services → hooks → context)

### Data Flow
```
Backend API (/api/config/status)
   ↓
AIStatusService.checkAIStatus()
   ↓
useAIStatusQuery (React Query)
   ↓
AIStatusContext (React Context)
   ↓
useAIStatus() (Consumer Hook)
   ↓
Components (Chat, Sidebar, Input, Banner)
```

### Caching Strategy
- **Initial Fetch**: On app mount
- **Stale Time**: 5 minutes (rarely changes)
- **Cache Time**: Infinity (needed throughout session)
- **Refetch on Window Focus**: Yes (user returns to tab)
- **Background Refetch**: Every 10 minutes
- **Retry**: Once on failure

---

## Testing Considerations

### Unit Tests Needed
1. **AIStatusService.checkAIStatus()**
   - Test successful response
   - Test error handling (network failure)
   - Test schema validation failure
   - Test timeout behavior

2. **useAIStatusQuery**
   - Test query success state
   - Test query loading state
   - Test query error state
   - Test refetch behavior

3. **useAIStatus context hook**
   - Test context value shape
   - Test error when used outside provider
   - Test derived state (isAIAvailable)

4. **Components**
   - Test banner renders when unavailable
   - Test banner hidden when available
   - Test input disabled state
   - Test button disabled state

### Integration Tests Needed
1. Full flow: Provider → Query → Context → Components
2. Status change handling (available → unavailable)
3. Refetch behavior on window focus
4. Background refetch timer

---

## Performance Considerations

### Optimizations
1. **Single Query**: One API call on mount, shared via context
2. **Long Cache**: 5-minute stale time reduces unnecessary requests
3. **No Re-fetching on Mount**: Components don't trigger new queries
4. **Selective Re-rendering**: Only components using `useAIStatus()` re-render
5. **Lazy Evaluation**: Banner/indicator components return early if not needed

### Bundle Size Impact
- **New Dependencies**: None (using existing React Query, Zod, axios)
- **New Code**: ~500 lines total
- **Tree Shaking**: Unused components won't be bundled

---

## Accessibility Considerations

1. **Keyboard Navigation**: All buttons remain focusable (even when disabled)
2. **Screen Readers**: Alert component has proper ARIA attributes
3. **Visual Feedback**: Disabled state has clear visual indicators (opacity, cursor)
4. **Error Messages**: Clear, actionable text for users
5. **Color Contrast**: Uses theme-aware colors (respects dark/light mode)

---

## Future Enhancements (Out of Scope)

1. **Auto-Retry on Connection**: If status changes, refetch conversations
2. **Status Page**: Dedicated `/status` page showing all service health
3. **Notification**: Toast notification when status changes during session
4. **Admin Panel**: Allow runtime configuration of API key
5. **Fallback AI Providers**: Support multiple AI providers (Anthropic, Cohere, etc.)

---

## Migration Path (No Breaking Changes)

This implementation is **additive only**:
- No existing functionality removed
- No API changes
- No prop changes to existing components
- Only internal component modifications
- Fully backward compatible

If backend endpoint `/api/config/status` doesn't exist yet:
- Frontend will fail gracefully (assume unavailable)
- User sees unavailable message
- No crashes or errors

---

## Questions Answered

### 1. Status Check Hook?
**Answer**: Custom React Query hook (`useAIStatusQuery`) called by context provider on app mount

### 2. State Management?
**Answer**: React Context (`AIStatusProvider`) wrapping entire app, consumed via `useAIStatus()` hook

### 3. UI Component Design?
**Answer**: Disabled textarea with visual feedback (opacity, cursor), plus top banner with setup instructions

### 4. Error Message Location?
**Answer**: Top of chat area (always visible), plus input placeholder and sidebar indicator

### 5. Conversation List Access?
**Answer**: Yes, sidebar shows past conversations (view-only mode) even when AI unavailable

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `ai-status.schema.ts` with Zod schemas
- [ ] Create `ai-status.service.ts` with health check logic
- [ ] Create `useAIStatusQuery.ts` with React Query hook
- [ ] Add unit tests for service and query hook

### Phase 2: Context Setup
- [ ] Create `useAIStatusContext.tsx` with provider and consumer hook
- [ ] Wrap app with `AIStatusProvider` in `layout.tsx`
- [ ] Add unit tests for context

### Phase 3: UI Components
- [ ] Create `ai-unavailable-banner.tsx` component
- [ ] Modify `multimodal-input.tsx` to disable input
- [ ] Modify `chat.tsx` to show banner
- [ ] Modify `conversation-sidebar.tsx` to disable new chat
- [ ] Add component tests

### Phase 4: Integration Testing
- [ ] Test full flow (mount → query → context → UI)
- [ ] Test status change scenarios
- [ ] Test refetch behavior
- [ ] Test error handling

### Phase 5: Polish
- [ ] Review accessibility
- [ ] Review responsive design
- [ ] Review dark/light theme support
- [ ] Update documentation

---

## Notes for Implementation

### Important Gotchas
1. **Provider Order**: `AIStatusProvider` must be inside `QueryClientProvider` (from React Query)
2. **Query Client**: Ensure `QueryClientProvider` exists in `layout.tsx` (check if already added)
3. **CSS Variables**: Banner uses `--destructive` color - ensure it's defined in `globals.css` (already confirmed)
4. **API Endpoint**: Backend must implement `/api/config/status` endpoint first
5. **TypeScript**: Update `tsconfig.json` paths if needed for `@/app/features/ai-status/*` imports

### Outdated Knowledge Warnings
- **Old Pattern**: Don't use global state libraries (Zustand, Redux) for this
- **Old Pattern**: Don't fetch status in every component separately
- **Old Pattern**: Don't use `useEffect` + `useState` for API calls (use React Query)
- **New Pattern**: Always use Zod schemas for validation
- **New Pattern**: Always use service layer for API calls
- **New Pattern**: Always use React Query for data fetching

### Testing Reminders
- **NO EXCEPTIONS**: This feature requires full test coverage
- Unit tests for service, query hook, context
- Integration tests for full flow
- Component tests for UI behavior
- All tests must pass with pristine output

---

## Summary

This implementation provides:
✅ Graceful degradation when AI unavailable
✅ User-friendly error messages
✅ Disabled input with clear visual feedback
✅ Read-only access to conversation history
✅ Single source of truth for AI status
✅ Performant (single query, cached)
✅ Type-safe (Zod + TypeScript)
✅ Follows existing architecture patterns
✅ No breaking changes
✅ Fully testable
✅ Accessible

The implementation is production-ready and requires no external dependencies beyond what's already in the project.
