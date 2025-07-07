/**
 * Configuration constants for CCO-MCP
 */

import { homedir } from "os";
import { join } from "path";

/**
 * Configuration file paths
 */
export const CONFIG_DIR = join(homedir(), ".cco-mcp");
export const CONFIG_FILE_PATH = join(CONFIG_DIR, "config.json");

/**
 * Environment variable names
 */
export const ENV_VARS = {
  CONFIG_PATH: "CCO_CONFIG_PATH",
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  TIMEOUT_MS: 300000, // 5 minutes
  MAX_RULES: 100,
  MAX_RULE_NAME_LENGTH: 100,
  MAX_RULE_DESCRIPTION_LENGTH: 500,
} as const;

/**
 * Wildcard matching characters
 */
export const WILDCARD_CHARS = {
  SINGLE: "?", // Matches exactly one character
  MULTIPLE: "*", // Matches zero or more characters
} as const;