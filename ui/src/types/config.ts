/**
 * Configuration types for the UI
 */

export type ApprovalAction = 'approve' | 'deny' | 'review';

// Tool types following Claude Code's permission system
export type ToolType = 'builtin' | 'mcp';

// List of built-in tools available in Claude Code
export type BuiltInToolName = 
  | 'Agent' 
  | 'Bash' 
  | 'Edit' 
  | 'Glob' 
  | 'Grep' 
  | 'LS' 
  | 'MultiEdit' 
  | 'NotebookEdit' 
  | 'NotebookRead' 
  | 'Read' 
  | 'TodoRead' 
  | 'TodoWrite' 
  | 'WebFetch' 
  | 'WebSearch' 
  | 'Write';

export interface TimeoutConfig {
  duration: number;
  defaultAction: 'approve' | 'deny';
}

// Built-in tool matching configuration
export interface BuiltInToolMatch {
  type: 'builtin';
  toolName: BuiltInToolName | string; // Allow string for future tools
  optionalSpecifier?: string; // e.g., "npm run test:*" for Bash, "docs/**" for Edit/Read
}

// MCP tool matching configuration
export interface MCPToolMatch {
  type: 'mcp';
  serverName: string; // MCP server name (required)
  toolName?: string; // Specific tool name (optional - if omitted, matches all tools on server)
  optionalSpecifier?: string; // Optional specifier (defaults to "*")
}

export type ToolMatch = BuiltInToolMatch | MCPToolMatch;

// Updated match criteria following Claude Code permission format
export interface MatchCriteria {
  tool: ToolMatch;
  agentIdentity?: string; // Simplified for future use (currently disabled)
  inputParameters?: Record<string, any>; // Future feature (currently disabled)
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

// Helper type for built-in tool metadata
export interface BuiltInToolInfo {
  name: BuiltInToolName;
  requiresPermission: boolean;
  exampleSpecifiers?: string[];
  description: string;
}

// Built-in tools metadata for UI display
export const BUILT_IN_TOOLS: Record<BuiltInToolName, BuiltInToolInfo> = {
  Agent: {
    name: 'Agent',
    requiresPermission: false,
    description: 'Runs a sub-agent to handle complex, multi-step tasks'
  },
  Bash: {
    name: 'Bash',
    requiresPermission: true,
    exampleSpecifiers: ['npm run build', 'npm run test:*', 'git status'],
    description: 'Executes shell commands in your environment'
  },
  Edit: {
    name: 'Edit',
    requiresPermission: true,
    exampleSpecifiers: ['docs/**', 'src/*.js', '*.config.js'],
    description: 'Makes targeted edits to specific files'
  },
  Glob: {
    name: 'Glob',
    requiresPermission: false,
    description: 'Finds files based on pattern matching'
  },
  Grep: {
    name: 'Grep',
    requiresPermission: false,
    description: 'Searches for patterns in file contents'
  },
  LS: {
    name: 'LS',
    requiresPermission: false,
    description: 'Lists files and directories'
  },
  MultiEdit: {
    name: 'MultiEdit',
    requiresPermission: true,
    exampleSpecifiers: ['docs/**', 'src/*.js'],
    description: 'Performs multiple edits on a single file atomically'
  },
  NotebookEdit: {
    name: 'NotebookEdit',
    requiresPermission: true,
    exampleSpecifiers: ['*.ipynb'],
    description: 'Modifies Jupyter notebook cells'
  },
  NotebookRead: {
    name: 'NotebookRead',
    requiresPermission: false,
    description: 'Reads and displays Jupyter notebook contents'
  },
  Read: {
    name: 'Read',
    requiresPermission: false,
    exampleSpecifiers: ['docs/**', '~/.zshrc', '*.config.js'],
    description: 'Reads the contents of files'
  },
  TodoRead: {
    name: 'TodoRead',
    requiresPermission: false,
    description: 'Reads the current session\'s task list'
  },
  TodoWrite: {
    name: 'TodoWrite',
    requiresPermission: false,
    description: 'Creates and manages structured task lists'
  },
  WebFetch: {
    name: 'WebFetch',
    requiresPermission: true,
    exampleSpecifiers: ['domain:example.com', 'domain:*.example.com'],
    description: 'Fetches content from a specified URL'
  },
  WebSearch: {
    name: 'WebSearch',
    requiresPermission: true,
    description: 'Performs web searches with domain filtering'
  },
  Write: {
    name: 'Write',
    requiresPermission: true,
    exampleSpecifiers: ['docs/**', 'tmp/*', '*.log'],
    description: 'Creates or overwrites files'
  }
};