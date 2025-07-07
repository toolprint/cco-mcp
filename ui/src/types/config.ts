/**
 * Configuration types for the UI
 */

export type ApprovalAction = 'approve' | 'deny' | 'review';
export type MatchPatternType = 'exact' | 'wildcard' | 'regex';
export type MatchOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'in' | 'notIn';

export interface TimeoutConfig {
  duration: number;
  defaultAction: 'approve' | 'deny';
}

export interface MatchPattern {
  type: MatchPatternType;
  value: string;
  caseSensitive?: boolean;
}

export interface MatchCondition {
  field: string;
  operator: MatchOperator;
  value: any;
  caseSensitive?: boolean;
}

export interface MatchCriteria {
  toolName?: MatchPattern;
  agentIdentity?: MatchPattern;
  inputParameters?: Record<string, any>;
  conditions?: MatchCondition[];
}

export interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  match: MatchCriteria;
  action: ApprovalAction;
  timeoutOverride?: number;
  enabled?: boolean;
}

export interface ApprovalsConfig {
  enabled: boolean;
  rules: ApprovalRule[];
  defaultAction: ApprovalAction;
  timeout: TimeoutConfig;
}

export interface CCOMCPConfig {
  approvals: ApprovalsConfig;
}

// API Response types
export interface ConfigResponse {
  config: CCOMCPConfig;
}

export interface RuleTestRequest {
  toolName: string;
  agentIdentity?: string;
  input: Record<string, any>;
}

export interface RuleTestResponse {
  matched: boolean;
  rule?: ApprovalRule;
  reason: string;
}