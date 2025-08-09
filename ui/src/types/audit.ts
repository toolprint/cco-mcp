export type AuditLogState = "APPROVED" | "DENIED" | "NEEDS_REVIEW";

export interface AuditLogEntry {
  id: string;
  timestamp: Date | string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  request: Record<string, unknown>; // Added for compatibility
  response_snapshot?: string | Record<string, unknown>; // Added for response preview
  agent_identity: string;
  state: AuditLogState;
  expires_at: Date | string;

  // Optional fields for when decision is made
  decision_by?: string;
  decision_time?: Date | string;
  denied_by_timeout?: boolean;

  // Unified audit stream fields
  source?: "mcp" | "hook";
  hookEventId?: string;
  sessionId?: string;
  metadata?: {
    waitingForUserResponse?: boolean;
    askMessage?: string;
    inferredDecision?: boolean;
    inferenceMethod?: "post-tool-use" | "timeout-no-execution";
  };
  matched_rule?: {
    id: string;
    name: string;
  };
}

export interface AuditLogQueryParams {
  state?: AuditLogState;
  agent_identity?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface AuditLogQueryResponse {
  entries: AuditLogEntry[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
