/**
 * Configuration types for CCO-MCP
 */

/**
 * Root configuration structure
 */
export interface CCOMCPConfig {
  approvals: ApprovalsConfig;
  // Future config sections can be added here (e.g., logging, integrations, etc.)
}

/**
 * Configuration for approval behavior
 */
export interface ApprovalsConfig {
  /** Whether auto-approval system is enabled */
  enabled: boolean;
  
  /** List of approval rules evaluated in priority order */
  rules: ApprovalRule[];
  
  /** Default action when no rules match */
  defaultAction: ApprovalAction;
  
  /** Timeout configuration for pending approvals */
  timeout: TimeoutConfig;
}

/**
 * Individual approval rule
 */
export interface ApprovalRule {
  /** Unique identifier for the rule */
  id: string;
  
  /** Human-readable name for the rule */
  name: string;
  
  /** Optional description explaining the rule's purpose */
  description?: string;
  
  /** Priority for rule evaluation (lower number = higher priority) */
  priority: number;
  
  /** Criteria for matching tool calls */
  match: MatchCriteria;
  
  /** Action to take when rule matches */
  action: ApprovalAction;
  
  /** Optional timeout override for this specific rule (milliseconds) */
  timeoutOverride?: number;
  
  /** Whether this rule is active */
  enabled?: boolean;
}

/**
 * Criteria for matching tool calls against rules
 */
export interface MatchCriteria {
  /** Match against tool name */
  toolName?: MatchPattern;
  
  /** Match against agent identity */
  agentIdentity?: MatchPattern;
  
  /** Match against input parameters (exact match) */
  inputParameters?: Record<string, any>;
  
  /** Advanced conditions for complex matching */
  conditions?: MatchCondition[];
}

/**
 * Pattern matching configuration
 */
export interface MatchPattern {
  /** Type of pattern matching to use */
  type: 'exact' | 'wildcard' | 'regex';
  
  /** The pattern value */
  value: string;
  
  /** Case sensitive matching (default: false) */
  caseSensitive?: boolean;
}

/**
 * Advanced matching condition
 */
export interface MatchCondition {
  /** JSON path to the field in tool input (e.g., "file_path", "command.name") */
  field: string;
  
  /** Comparison operator */
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'in' | 'notIn';
  
  /** Value to compare against */
  value: any;
  
  /** Case sensitive comparison (default: false) */
  caseSensitive?: boolean;
}

/**
 * Possible approval actions
 */
export type ApprovalAction = 'approve' | 'deny' | 'review';

/**
 * Timeout configuration for pending approvals
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  duration: number;
  
  /** Action to take when timeout is reached */
  defaultAction: 'approve' | 'deny';
}

/**
 * Rule match result
 */
export interface RuleMatchResult {
  /** Whether a rule matched */
  matched: boolean;
  
  /** The matching rule (if any) */
  rule?: ApprovalRule;
  
  /** Reason for the match/no-match */
  reason?: string;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  
  /** Validation errors (if any) */
  errors?: string[];
  
  /** Validation warnings (if any) */
  warnings?: string[];
}