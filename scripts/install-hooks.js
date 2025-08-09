#!/usr/bin/env node

/**
 * Claude Code Hook Installation Script
 *
 * This script configures Claude Code to use the CCO-MCP hook system.
 * It backs up existing configuration and adds hook configuration for all event types.
 *
 * Usage: node install-hooks.js [--claude-dir ~/.claude] [--cco-path /path/to/cco-mcp]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Default paths
const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), ".claude");
const DEFAULT_CCO_PATH = process.cwd();

// Command line argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    claudeDir: DEFAULT_CLAUDE_DIR,
    ccoPath: DEFAULT_CCO_PATH,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      config.help = true;
    } else if (arg === "--claude-dir" && i + 1 < args.length) {
      config.claudeDir = path.resolve(args[i + 1]);
      i++;
    } else if (arg === "--cco-path" && i + 1 < args.length) {
      config.ccoPath = path.resolve(args[i + 1]);
      i++;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return config;
}

// Display help information
function showHelp() {
  console.log(`
Claude Code Hook Installation Script

This script configures Claude Code to use the CCO-MCP hook system.
It backs up existing configuration and adds hook configuration for all event types.

Usage: node install-hooks.js [options]

Options:
  --claude-dir <path>   Path to Claude Code configuration directory (default: ~/.claude)
  --cco-path <path>     Path to CCO-MCP installation (default: current directory)
  --help, -h            Show this help message

Examples:
  node install-hooks.js
  node install-hooks.js --claude-dir /custom/path/.claude
  node install-hooks.js --cco-path /path/to/cco-mcp --claude-dir ~/.claude

The script will:
1. Locate or create the Claude Code settings.json file
2. Create a backup of existing configuration
3. Add hook configuration for PreToolUse, PostToolUse, Notification, Stop, and SubagentStop events
4. Verify the bridge script exists and is executable
`);
}

// Logging utilities
function log(message) {
  console.log(`[INFO] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
}

function success(message) {
  console.log(`[SUCCESS] ${message}`);
}

// Verify CCO-MCP installation
function verifyCCOInstallation(ccoPath) {
  const bridgeScript = path.join(ccoPath, "hooks", "bridge.js");

  if (!fs.existsSync(bridgeScript)) {
    error(`Bridge script not found at: ${bridgeScript}`);
    error(
      "Make sure you are running this script from the CCO-MCP installation directory."
    );
    return false;
  }

  // Check if bridge script is executable
  try {
    fs.accessSync(bridgeScript, fs.constants.F_OK | fs.constants.X_OK);
    log(`Bridge script found and executable: ${bridgeScript}`);
  } catch (err) {
    warn(`Bridge script exists but may not be executable: ${bridgeScript}`);
    warn("You may need to run: chmod +x hooks/bridge.js");
  }

  return true;
}

// Create Claude directory if it doesn't exist
function ensureClaudeDirectory(claudeDir) {
  if (!fs.existsSync(claudeDir)) {
    log(`Creating Claude directory: ${claudeDir}`);
    fs.mkdirSync(claudeDir, { recursive: true });
  } else {
    log(`Claude directory exists: ${claudeDir}`);
  }
  return true;
}

// Read existing settings or create default
function readSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(content);
      log(`Loaded existing settings from: ${settingsPath}`);
      return settings;
    } catch (err) {
      error(`Failed to parse existing settings.json: ${err.message}`);
      return null;
    }
  } else {
    log(`No existing settings found, creating new configuration`);
    return {};
  }
}

// Create backup of existing settings
function backupSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${settingsPath}.backup-${timestamp}`;

  try {
    fs.copyFileSync(settingsPath, backupPath);
    success(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (err) {
    error(`Failed to create backup: ${err.message}`);
    return null;
  }
}

// Generate hook configuration
function generateHookConfig(bridgeScriptPath) {
  const hookConfig = {
    matcher: ".*",
    hooks: [
      {
        type: "command",
        command: `node "${bridgeScriptPath}"`,
      },
    ],
  };

  return {
    PreToolUse: [hookConfig],
    PostToolUse: [hookConfig],
    Notification: [hookConfig],
    Stop: [hookConfig],
    SubagentStop: [hookConfig],
  };
}

// Merge hook configuration with existing settings
function mergeHookConfiguration(settings, hookConfig) {
  // Initialize hooks section if it doesn't exist
  if (!settings.hooks) {
    settings.hooks = {};
  }

  let addedHooks = [];
  let updatedHooks = [];

  for (const [eventType, config] of Object.entries(hookConfig)) {
    if (settings.hooks[eventType]) {
      // Check if CCO-MCP hook already exists
      const existingHook = settings.hooks[eventType].find((hook) =>
        hook.hooks?.some((h) => h.command?.includes("bridge.js"))
      );

      if (existingHook) {
        warn(`Hook for ${eventType} already exists, updating configuration`);
        // Update the existing hook
        const hookIndex = settings.hooks[eventType].indexOf(existingHook);
        settings.hooks[eventType][hookIndex] = config[0];
        updatedHooks.push(eventType);
      } else {
        // Add to existing hooks
        settings.hooks[eventType].push(config[0]);
        addedHooks.push(eventType);
      }
    } else {
      // Create new hook configuration
      settings.hooks[eventType] = config;
      addedHooks.push(eventType);
    }
  }

  return { addedHooks, updatedHooks };
}

// Write updated settings
function writeSettings(settingsPath, settings) {
  try {
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(settingsPath, content, "utf8");
    success(`Updated settings written to: ${settingsPath}`);
    return true;
  } catch (err) {
    error(`Failed to write settings: ${err.message}`);
    return false;
  }
}

// Main installation function
async function installHooks() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  log("Starting Claude Code hook installation...");
  log(`Claude directory: ${config.claudeDir}`);
  log(`CCO-MCP path: ${config.ccoPath}`);

  // Verify CCO-MCP installation
  if (!verifyCCOInstallation(config.ccoPath)) {
    process.exit(1);
  }

  // Ensure Claude directory exists
  if (!ensureClaudeDirectory(config.claudeDir)) {
    process.exit(1);
  }

  // Paths
  const settingsPath = path.join(config.claudeDir, "settings.json");
  const bridgeScriptPath = path.join(config.ccoPath, "hooks", "bridge.js");

  // Read existing settings
  const settings = readSettings(settingsPath);
  if (settings === null) {
    process.exit(1);
  }

  // Create backup if settings exist
  if (fs.existsSync(settingsPath)) {
    const backupPath = backupSettings(settingsPath);
    if (!backupPath) {
      warn("Failed to create backup, continuing anyway...");
    }
  }

  // Generate hook configuration
  const hookConfig = generateHookConfig(bridgeScriptPath);
  log("Generated hook configuration for all event types");

  // Merge with existing settings
  const { addedHooks, updatedHooks } = mergeHookConfiguration(
    settings,
    hookConfig
  );

  // Write updated settings
  if (!writeSettings(settingsPath, settings)) {
    process.exit(1);
  }

  // Report results
  success("Hook installation completed successfully!");

  if (addedHooks.length > 0) {
    success(`Added hooks for: ${addedHooks.join(", ")}`);
  }

  if (updatedHooks.length > 0) {
    success(`Updated hooks for: ${updatedHooks.join(", ")}`);
  }

  console.log("\nNext steps:");
  console.log("1. Start CCO-MCP server: npm start or pnpm start");
  console.log("2. Access the dashboard at: http://localhost:8660");
  console.log("3. Configure approval rules in the Configuration tab");
  console.log("4. Monitor hook events in the Hook Events tab");
  console.log(
    "\nThe hooks will now intercept tool calls and send them to CCO-MCP for evaluation."
  );
}

// Error handling
process.on("uncaughtException", (error) => {
  error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Run the installer
installHooks().catch((err) => {
  error(`Installation failed: ${err.message}`);
  process.exit(1);
});
