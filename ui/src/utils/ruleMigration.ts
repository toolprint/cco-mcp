import type { ApprovalRule, ToolMatch } from "../types/config";

// Type for old rule format
interface OldMatchCriteria {
  toolName?: {
    type: 'exact' | 'wildcard' | 'regex';
    value: string;
    caseSensitive?: boolean;
  };
  agentIdentity?: {
    type: 'exact' | 'wildcard' | 'regex';
    value: string;
    caseSensitive?: boolean;
  };
  inputParameters?: Record<string, any>;
  conditions?: Array<{
    field: string;
    operator: string;
    value: any;
    caseSensitive?: boolean;
  }>;
}


/**
 * Migrate old rule format to new permission-based format
 */
export function migrateRule(oldRule: any): ApprovalRule {
  // If it already has the new format, return as-is
  if (oldRule.match?.tool?.type) {
    return oldRule as ApprovalRule;
  }

  const oldMatch = oldRule.match as OldMatchCriteria;
  
  // Convert old toolName to new tool format
  let tool: ToolMatch | undefined;
  
  if (oldMatch.toolName) {
    const toolValue = oldMatch.toolName.value;
    
    // Check if it's an MCP tool
    if (toolValue.startsWith('mcp__')) {
      // Parse MCP format: mcp__server__tool
      const parts = toolValue.split('__');
      tool = {
        type: 'mcp',
        serverName: parts[1] || '',
        toolName: parts[2] || undefined,
        optionalSpecifier: '*',
      };
    } else {
      // Built-in tool
      tool = {
        type: 'builtin',
        toolName: toolValue,
        // Convert wildcard patterns to optional specifiers
        optionalSpecifier: oldMatch.toolName.type === 'wildcard' ? '*' : undefined,
      };
    }
  } else {
    // Default to a safe rule that matches nothing
    tool = {
      type: 'builtin',
      toolName: 'Unknown',
      optionalSpecifier: undefined,
    };
  }

  // Migrate the rule
  const migratedRule: ApprovalRule = {
    ...oldRule,
    match: {
      tool,
      agentIdentity: oldMatch.agentIdentity?.value,
      inputParameters: oldMatch.inputParameters,
    },
  };

  return migratedRule;
}

/**
 * Check if a rule needs migration
 */
export function needsMigration(rule: any): boolean {
  return !rule.match?.tool?.type;
}

/**
 * Migrate all rules in a configuration
 */
export function migrateRules(rules: any[]): ApprovalRule[] {
  return rules.map(rule => {
    if (needsMigration(rule)) {
      console.log('Migrating rule:', rule.name);
      return migrateRule(rule);
    }
    return rule;
  });
}

/**
 * Convert new rule format back to old format for server compatibility
 */
export function ruleToServerFormat(rule: ApprovalRule): any {
  const { tool } = rule.match;
  
  let toolName: any;
  
  if (tool.type === 'builtin') {
    toolName = {
      type: 'exact',
      value: tool.toolName,
      caseSensitive: true, // Always case-sensitive per requirements
    };
    
    // Handle optional specifier
    if (tool.optionalSpecifier) {
      // For now, treat specifiers as part of the tool name pattern
      toolName.type = 'wildcard';
      toolName.value = `${tool.toolName}(${tool.optionalSpecifier})`;
    }
  } else {
    // MCP tool
    let toolValue = `mcp__${tool.serverName}`;
    if (tool.toolName) {
      toolValue += `__${tool.toolName}`;
    }
    
    toolName = {
      type: 'exact',
      value: toolValue,
      caseSensitive: true,
    };
  }
  
  const oldFormat = {
    ...rule,
    match: {
      toolName,
      ...(rule.match.agentIdentity && {
        agentIdentity: {
          type: 'exact',
          value: rule.match.agentIdentity,
          caseSensitive: true,
        },
      }),
      ...(rule.match.inputParameters && {
        inputParameters: rule.match.inputParameters,
      }),
    },
  };
  
  return oldFormat;
}