/**
 * Audit log entry state
 */
export type AuditLogState = 'APPROVED' | 'DENIED' | 'NEEDS_REVIEW';

/**
 * Represents a single audit log entry for tool call approval requests
 */
export interface AuditLogEntry {
  /** Unique identifier for the entry */
  id: string;
  
  /** Timestamp when the entry was created */
  timestamp: Date;
  
  /** Name of the tool that requested approval */
  tool_name: string;
  
  /** Input parameters for the tool call */
  tool_input: Record<string, any>;
  
  /** Identity of the agent making the request (if available) */
  agent_identity?: string;
  
  /** Current state of the approval request */
  state: AuditLogState;
  
  /** Identity of who made the decision (if applicable) */
  decision_by?: string;
  
  /** Time when the decision was made */
  decision_time?: Date;
  
  /** Whether the request was denied due to timeout */
  denied_by_timeout?: boolean;
  
  /** Expiration time for the entry (for TTL) */
  expires_at: Date;
}

/**
 * Configuration options for the audit log service
 */
export interface AuditLogConfig {
  /** Maximum number of entries to store (default: 1000) */
  maxEntries?: number;
  
  /** Time-to-live for entries in milliseconds (default: 24 hours) */
  ttlMs?: number;
  
  /** Timeout for auto-denial in milliseconds (default: 5 minutes) */
  autoDenyTimeoutMs?: number;
}

/**
 * Filter options for querying audit log entries
 */
export interface AuditLogFilter {
  /** Filter by state */
  state?: AuditLogState;
  
  /** Filter by agent identity */
  agent_identity?: string;
  
  /** Free-text search across tool name and input */
  search?: string;
  
  /** Pagination offset */
  offset?: number;
  
  /** Pagination limit */
  limit?: number;
}

/**
 * Result of a paginated query
 */
export interface AuditLogQueryResult {
  entries: AuditLogEntry[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Event types emitted by the audit log service
 */
export type AuditLogEventType = 'new-entry' | 'state-change' | 'entry-expired';

/**
 * Event payload for audit log events
 */
export interface AuditLogEvent {
  type: AuditLogEventType;
  entry: AuditLogEntry;
  previousState?: AuditLogState;
}