/**
 * Zod validation schemas for CCO-MCP configuration
 */

import { z } from "zod";
import type { 
  CCOMCPConfig, 
  ApprovalsConfig, 
  ApprovalRule, 
  MatchCriteria, 
  ToolMatch,
  BuiltInToolMatch,
  MCPToolMatch,
  ApprovalAction,
  TimeoutConfig 
} from "./types.js";

/**
 * Schema for approval actions
 */
export const ApprovalActionSchema = z.enum(['approve', 'deny', 'review']);

/**
 * Schema for built-in tool match
 */
export const BuiltInToolMatchSchema = z.object({
  type: z.literal('builtin'),
  toolName: z.string().min(1, "Tool name cannot be empty"),
  optionalSpecifier: z.string().optional(),
}) satisfies z.ZodType<BuiltInToolMatch>;

/**
 * Schema for MCP tool match
 */
export const MCPToolMatchSchema = z.object({
  type: z.literal('mcp'),
  serverName: z.string().min(1, "Server name cannot be empty"),
  toolName: z.string().optional(),
  optionalSpecifier: z.string().optional(),
}) satisfies z.ZodType<MCPToolMatch>;

/**
 * Schema for tool match (union of built-in and MCP)
 */
export const ToolMatchSchema = z.discriminatedUnion('type', [
  BuiltInToolMatchSchema,
  MCPToolMatchSchema,
]) satisfies z.ZodType<ToolMatch>;

/**
 * Schema for match criteria
 */
export const MatchCriteriaSchema = z.object({
  tool: ToolMatchSchema,
  agentIdentity: z.string().optional(),
  inputParameters: z.record(z.any()).optional(),
}) satisfies z.ZodType<MatchCriteria>;

/**
 * Schema for approval rules
 */
export const ApprovalRuleSchema = z.object({
  id: z.string().min(1, "Rule ID cannot be empty").regex(/^[a-zA-Z0-9-_]+$/, "Rule ID must be alphanumeric with hyphens/underscores"),
  name: z.string().min(1, "Rule name cannot be empty"),
  description: z.string().optional(),
  priority: z.number().int().min(0, "Priority must be non-negative"),
  match: MatchCriteriaSchema,
  action: ApprovalActionSchema,
  timeoutOverride: z.number().int().positive().optional(),
  enabled: z.boolean().optional().default(true),
}) satisfies z.ZodType<ApprovalRule>;

/**
 * Schema for timeout configuration
 */
export const TimeoutConfigSchema = z.object({
  duration: z.number().int().min(1000, "Timeout must be at least 1 second").max(3600000, "Timeout cannot exceed 1 hour"),
  defaultAction: z.enum(['approve', 'deny']),
}) satisfies z.ZodType<TimeoutConfig>;

/**
 * Schema for approvals configuration
 */
export const ApprovalsConfigSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(ApprovalRuleSchema).default([]),
  defaultAction: ApprovalActionSchema,
  timeout: TimeoutConfigSchema,
}).refine(
  (data) => {
    // Check for duplicate rule IDs
    const ids = data.rules.map(r => r.id);
    const uniqueIds = new Set(ids);
    return ids.length === uniqueIds.size;
  },
  {
    message: "Rule IDs must be unique",
  }
) satisfies z.ZodType<ApprovalsConfig>;

/**
 * Schema for root configuration
 */
export const CCOMCPConfigSchema = z.object({
  approvals: ApprovalsConfigSchema,
}) satisfies z.ZodType<CCOMCPConfig>;

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  duration: 300000, // 5 minutes
  defaultAction: 'deny',
};

/**
 * Default approvals configuration
 */
export const DEFAULT_APPROVALS_CONFIG: ApprovalsConfig = {
  enabled: true,
  rules: [],
  defaultAction: 'review',
  timeout: DEFAULT_TIMEOUT_CONFIG,
};

/**
 * Default root configuration
 */
export const DEFAULT_CONFIG: CCOMCPConfig = {
  approvals: DEFAULT_APPROVALS_CONFIG,
};

/**
 * Validate a configuration object
 */
export function validateConfig(config: unknown): z.SafeParseReturnType<CCOMCPConfig, CCOMCPConfig> {
  return CCOMCPConfigSchema.safeParse(config);
}

/**
 * Validate a partial configuration for updates
 */
export function validatePartialConfig(config: unknown): z.SafeParseReturnType<Partial<CCOMCPConfig>, Partial<CCOMCPConfig>> {
  return CCOMCPConfigSchema.partial().safeParse(config);
}

/**
 * Validate an approval rule
 */
export function validateApprovalRule(rule: unknown): z.SafeParseReturnType<ApprovalRule, ApprovalRule> {
  return ApprovalRuleSchema.safeParse(rule);
}