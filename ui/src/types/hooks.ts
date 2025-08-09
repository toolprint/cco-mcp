/**
 * Hook event types for UI
 */

export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop' | 'SubagentStop';

export interface HookTool {
  name: string;
  input: Record<string, any>;
  output?: any;
  error?: string;
}

export interface BaseHookEvent {
  type: HookEventType;
  sessionId: string;
  timestamp: string;
}

export interface PreToolUseEvent extends BaseHookEvent {
  type: 'PreToolUse';
  tool: HookTool;
  agentIdentity?: string;
}

export interface PostToolUseEvent extends BaseHookEvent {
  type: 'PostToolUse';
  tool: HookTool;
  agentIdentity?: string;
  duration: number;
}

export interface NotificationEvent extends BaseHookEvent {
  type: 'Notification';
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface StopEvent extends BaseHookEvent {
  type: 'Stop';
  reason?: string;
  agentIdentity?: string;
}

export interface SubagentStopEvent extends BaseHookEvent {
  type: 'SubagentStop';
  reason?: string;
  agentIdentity?: string;
}

export type HookEvent = 
  | PreToolUseEvent 
  | PostToolUseEvent 
  | NotificationEvent 
  | StopEvent 
  | SubagentStopEvent;

export interface HookEvaluationResult {
  behavior: 'allow' | 'deny';
  message?: string;
  ruleId?: string;
  ruleName?: string;
  evaluationTime: number;
}

export interface StoredHookEvent {
  id: string;
  receivedAt: string;
  evaluation?: HookEvaluationResult;
  expiresAt: string;
  
  // Event properties
  type: HookEventType;
  sessionId: string;
  timestamp: string;
  tool?: HookTool;
  agentIdentity?: string;
  message?: string;
  level?: 'info' | 'warning' | 'error';
  reason?: string;
  duration?: number;
}

export interface HookEventFilters {
  type?: HookEventType | HookEventType[];
  sessionId?: string;
  agentIdentity?: string;
  toolName?: string;
  limit?: number;
  offset?: number;
  since?: string;
  before?: string;
}

export interface HookEventQueryResult {
  events: StoredHookEvent[];
  total: number;
  offset: number;
  limit: number;
}

export interface HookEventStats {
  totalEvents: number;
  eventsByType: Record<HookEventType, number>;
  evaluationStats: {
    totalEvaluated: number;
    allowed: number;
    denied: number;
    avgEvaluationTime: number;
  };
  oldestEvent?: string;
  newestEvent?: string;
}