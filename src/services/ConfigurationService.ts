/**
 * Configuration service for managing CCO-MCP settings
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { watch, FSWatcher } from "fs";
import { EventEmitter } from "events";
import logger from "../logger.js";
import {
  CCOMCPConfig,
  ApprovalRule,
  ApprovalAction,
  RuleMatchResult,
  ToolMatch,
} from "../config/types.js";
import {
  validateConfig,
  DEFAULT_CONFIG,
  CCOMCPConfigSchema,
} from "../config/schema.js";
import {
  CONFIG_DIR,
  CONFIG_FILE_PATH,
  ENV_VARS,
  WILDCARD_CHARS,
} from "../config/constants.js";

/**
 * Tool call information for matching
 */
export interface ToolCallInfo {
  toolName: string;
  agentIdentity?: string;
  input: Record<string, any>;
}

/**
 * Configuration service events
 */
export interface ConfigurationServiceEvents {
  "config-loaded": (config: CCOMCPConfig) => void;
  "config-updated": (config: CCOMCPConfig) => void;
  "config-error": (error: Error) => void;
}

/**
 * Service for managing configuration
 */
export class ConfigurationService extends EventEmitter {
  private config: CCOMCPConfig;
  private fileWatcher?: FSWatcher;
  private configPath: string;

  constructor(configPath?: string) {
    super();
    this.configPath =
      configPath || process.env[ENV_VARS.CONFIG_PATH] || CONFIG_FILE_PATH;
    this.config = DEFAULT_CONFIG;
    this.loadConfiguration();
  }

  /**
   * Get current configuration
   */
  getConfig(): CCOMCPConfig {
    return this.config;
  }

  /**
   * Get approvals configuration
   */
  getApprovalsConfig() {
    return this.config.approvals;
  }

  /**
   * Check if auto-approval is enabled
   */
  isAutoApprovalEnabled(): boolean {
    return this.config.approvals.enabled;
  }

  /**
   * Get timeout configuration
   */
  getTimeoutMs(): number {
    return this.config.approvals.timeout.duration;
  }

  /**
   * Get timeout default action
   */
  getTimeoutAction(): "approve" | "deny" {
    return this.config.approvals.timeout.defaultAction;
  }

  /**
   * Match a tool call against configured rules
   */
  matchRules(toolCall: ToolCallInfo): RuleMatchResult {
    if (!this.isAutoApprovalEnabled()) {
      return {
        matched: false,
        reason: "Auto-approval is not enabled",
      };
    }

    const { rules } = this.config.approvals;

    // Sort rules by priority (lower number = higher priority)
    const sortedRules = [...rules]
      .filter((rule) => rule.enabled !== false)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(toolCall, rule)) {
        logger.debug(
          {
            rule: rule.name,
            toolName: toolCall.toolName,
            action: rule.action,
          },
          "Rule matched"
        );
        return {
          matched: true,
          rule,
          reason: `Matched rule: ${rule.name}`,
        };
      }
    }

    return {
      matched: false,
      reason: "No matching rules found",
    };
  }

  /**
   * Get the action to take for a tool call
   */
  getActionForToolCall(toolCall: ToolCallInfo): {
    action: ApprovalAction;
    rule?: ApprovalRule;
    timeout?: number;
  } {
    const matchResult = this.matchRules(toolCall);

    if (matchResult.matched && matchResult.rule) {
      return {
        action: matchResult.rule.action,
        rule: matchResult.rule,
        timeout: matchResult.rule.timeoutOverride || this.getTimeoutMs(),
      };
    }

    // No rule matched, use default action
    return {
      action: this.config.approvals.defaultAction,
      timeout: this.getTimeoutMs(),
    };
  }

  /**
   * Check if a tool call matches a specific rule
   */
  private matchesRule(toolCall: ToolCallInfo, rule: ApprovalRule): boolean {
    const { match } = rule;

    // Check tool match
    if (!this.matchesTool(toolCall.toolName, match.tool)) {
      return false;
    }

    // Check agent identity (simple string match for now)
    if (match.agentIdentity) {
      if (
        !toolCall.agentIdentity ||
        toolCall.agentIdentity !== match.agentIdentity
      ) {
        return false;
      }
    }

    // Check input parameters (exact match) - future feature
    if (match.inputParameters) {
      for (const [key, expectedValue] of Object.entries(
        match.inputParameters
      )) {
        if (!this.deepEqual(toolCall.input[key], expectedValue)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if a tool call matches a tool configuration
   */
  private matchesTool(toolName: string, tool: ToolMatch): boolean {
    if (tool.type === "builtin") {
      // For built-in tools, check exact match of tool name
      if (toolName !== tool.toolName) {
        return false;
      }

      // If there's an optional specifier, we need to check if the tool call includes it
      // For now, we'll accept any call to the tool (specifier validation would be done elsewhere)
      return true;
    } else {
      // MCP tool matching
      // Expected format: mcp__serverName__toolName
      const parts = toolName.split("__");
      if (parts.length < 2 || parts[0] !== "mcp") {
        return false;
      }

      const [, serverName, mcpToolName] = parts;

      // Check server name match
      if (serverName !== tool.serverName) {
        return false;
      }

      // If tool name is specified, check it matches
      if (tool.toolName && mcpToolName !== tool.toolName) {
        return false;
      }

      return true;
    }
  }

  /**
   * Get value by JSON path
   */
  private getValueByPath(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!this.deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  }

  /**
   * Load configuration from file
   */
  private loadConfiguration(): void {
    try {
      // Ensure config directory exists
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      // Check if config file exists
      if (!existsSync(this.configPath)) {
        // Create default config file
        this.saveConfiguration(DEFAULT_CONFIG);
        logger.info(
          { path: this.configPath },
          "Created default configuration file"
        );
      }

      // Read and parse config file
      const configData = readFileSync(this.configPath, "utf-8");
      const parsedConfig = JSON.parse(configData);

      // Validate configuration
      const validation = validateConfig(parsedConfig);
      if (!validation.success) {
        logger.error(
          { errors: validation.error.errors, path: this.configPath },
          "Invalid configuration file"
        );
        this.emit(
          "config-error",
          new Error("Invalid configuration: " + validation.error.message)
        );
        return;
      }

      this.config = validation.data;
      logger.info(
        { path: this.configPath },
        "Configuration loaded successfully"
      );
      this.emit("config-loaded", this.config);

      // Set up file watcher
      this.setupFileWatcher();
    } catch (error) {
      logger.error(
        { error, path: this.configPath },
        "Failed to load configuration"
      );
      this.emit("config-error", error as Error);
    }
  }

  /**
   * Save configuration to file
   */
  saveConfiguration(config?: CCOMCPConfig): void {
    try {
      const configToSave = config || this.config;

      // Validate before saving
      const validation = validateConfig(configToSave);
      if (!validation.success) {
        throw new Error("Invalid configuration: " + validation.error.message);
      }

      // Ensure directory exists
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      // Write config file
      writeFileSync(
        this.configPath,
        JSON.stringify(configToSave, null, 2),
        "utf-8"
      );

      this.config = configToSave;
      logger.info(
        { path: this.configPath },
        "Configuration saved successfully"
      );
      this.emit("config-updated", this.config);
    } catch (error) {
      logger.error(
        { error, path: this.configPath },
        "Failed to save configuration"
      );
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfiguration(updates: Partial<CCOMCPConfig>): void {
    const newConfig = {
      ...this.config,
      ...updates,
    };

    this.saveConfiguration(newConfig);
  }

  /**
   * Add an approval rule
   */
  addRule(rule: ApprovalRule): void {
    const rules = [...this.config.approvals.rules, rule];
    this.updateConfiguration({
      approvals: {
        ...this.config.approvals,
        rules,
      },
    });
  }

  /**
   * Update an approval rule
   */
  updateRule(ruleId: string, updates: Partial<ApprovalRule>): void {
    const rules = this.config.approvals.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, ...updates } : rule
    );

    this.updateConfiguration({
      approvals: {
        ...this.config.approvals,
        rules,
      },
    });
  }

  /**
   * Remove an approval rule
   */
  removeRule(ruleId: string): void {
    const rules = this.config.approvals.rules.filter(
      (rule) => rule.id !== ruleId
    );
    this.updateConfiguration({
      approvals: {
        ...this.config.approvals,
        rules,
      },
    });
  }

  /**
   * Set up file watcher for hot-reloading
   */
  private setupFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    this.fileWatcher = watch(this.configPath, (eventType) => {
      if (eventType === "change") {
        logger.info(
          { path: this.configPath },
          "Configuration file changed, reloading"
        );
        this.loadConfiguration();
      }
    });
  }

  /**
   * Stop the configuration service
   */
  stop(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
  }
}

// Singleton instance
let configurationService: ConfigurationService | null = null;

/**
 * Get or create the configuration service instance
 */
export function getConfigurationService(): ConfigurationService {
  if (!configurationService) {
    configurationService = new ConfigurationService();
  }
  return configurationService;
}

/**
 * Stop the configuration service
 */
export function stopConfigurationService(): void {
  if (configurationService) {
    configurationService.stop();
    configurationService = null;
  }
}
