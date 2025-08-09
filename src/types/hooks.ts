/**
 * Hook event types and interfaces for Claude Code integration
 * Uses Claude Code's official hook event format
 */

/**
 * Claude Code's official hook event format
 */
export interface HookEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  
  // Tool-related fields (for PreToolUse, PostToolUse)
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_response?: Record<string, any>;
  
  // Notification fields
  message?: string;
  
  // Stop/SubagentStop fields
  stop_hook_active?: boolean;
  
  // UserPromptSubmit fields
  prompt?: string;
  
  // PreCompact fields
  trigger?: string;
  custom_instructions?: string;
  
  // SessionStart fields
  source?: string;
}

/**
 * Hook event types supported by Claude Code
 */
export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop' | 'SubagentStop' | 'UserPromptSubmit' | 'PreCompact' | 'SessionStart';

/**
 * Blocking response for PreToolUse events
 */
export interface BlockingResponse {
  behavior: 'allow' | 'deny';
  message: string;
}

/**
 * Hook evaluation result with additional metadata
 */
export interface HookEvaluationResult extends BlockingResponse {
  ruleId?: string;
  ruleName?: string;
  evaluationTime: number;
}

/**
 * Filters for querying hook events
 */
export interface HookEventFilters {
  type?: HookEventType | HookEventType[];
  sessionId?: string;
  agentIdentity?: string;
  toolName?: string;
  limit?: number;
  offset?: number;
  since?: string; // ISO timestamp
  before?: string; // ISO timestamp
}

/**
 * Hook event with metadata for storage and display
 */
export interface StoredHookEvent {
  /** Unique identifier for the event */
  id: string;
  
  /** When the event was received by CCO-MCP */
  receivedAt: Date;
  
  /** Evaluation result for PreToolUse events */
  evaluation?: HookEvaluationResult;
  
  /** Time-to-live for event cleanup */
  expiresAt: Date;

  /** Event type */
  type: string; // hook_event_name from Claude Code
  
  /** Session ID */
  sessionId: string; // session_id from Claude Code
  
  /** Timestamp (generated since Claude Code doesn't send one) */
  timestamp: string;
  
  /** Tool name (for PreToolUse and PostToolUse) */
  tool_name?: string;
  
  /** Tool input (for PreToolUse and PostToolUse) */
  tool_input?: Record<string, any>;
  
  /** Tool response (for PostToolUse) */
  tool_response?: Record<string, any>;
  
  /** Message (for Notification events) */
  message?: string;
  
  /** Reason (for Stop events) */
  reason?: string;
  
  /** Claude Code specific fields */
  transcript_path?: string;
  cwd?: string;
  
  /** Additional fields for other event types */
  prompt?: string;
  trigger?: string;
  custom_instructions?: string;
  source?: string;
  stop_hook_active?: boolean;
}

/**
 * Result of paginated hook event query
 */
export interface HookEventQueryResult {
  events: StoredHookEvent[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Hook service event types for SSE streaming
 */
export type HookServiceEventType = 'new-hook-event' | 'hook-evaluation' | 'hook-cleanup';

/**
 * Hook service event payload
 */
export interface HookServiceEvent {
  type: HookServiceEventType;
  event?: StoredHookEvent;
  evaluation?: HookEvaluationResult;
  cleanedCount?: number;
}