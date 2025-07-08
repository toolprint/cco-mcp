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
 * Tool types following Claude Code's permission system
 */
export type ToolType = 'builtin' | 'mcp';

/**
 * Built-in tool matching configuration
 */
export interface BuiltInToolMatch {
  type: 'builtin';
  toolName: string; // e.g., 'Bash', 'Edit', 'Read'
  optionalSpecifier?: string; // e.g., "npm run test:*" for Bash, "docs/**" for Edit/Read
}

/**
 * MCP tool matching configuration
 */
export interface MCPToolMatch {
  type: 'mcp';
  serverName: string; // MCP server name (required)
  toolName?: string; // Specific tool name (optional - if omitted, matches all tools on server)
  optionalSpecifier?: string; // Optional specifier (defaults to "*")
}

export type ToolMatch = BuiltInToolMatch | MCPToolMatch;

/**
 * Criteria for matching tool calls against rules
 */
export interface MatchCriteria {
  /** Tool matching configuration */
  tool: ToolMatch;
  
  /** Match against agent identity (simplified for future use) */
  agentIdentity?: string;
  
  /** Match against input parameters (future feature) */
  inputParameters?: Record<string, any>;
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