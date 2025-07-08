# CCO-MCP Configuration Guide

## Overview

CCO-MCP now supports a flexible configuration system that allows you to define rules for automatic approval or denial of tool calls. Instead of blindly approving all requests when auto-approve mode is enabled, you can now create specific rules based on tool names, agent identities, and input parameters.

## Configuration File Location

The configuration file is stored at:

- **Default**: `~/.cco-mcp/config.json`
- **Custom**: Set `CCO_CONFIG_PATH` environment variable

## Configuration Structure

```json
{
  "approvals": {
    "enabled": boolean,
    "rules": [...],
    "defaultAction": "approve" | "deny" | "review",
    "timeout": {
      "duration": number,
      "defaultAction": "approve" | "deny"
    }
  }
}
```

### Fields

- **`enabled`**: Whether the auto-approval system is active
- **`rules`**: Array of approval rules (evaluated in priority order)
- **`defaultAction`**: Action when no rules match (`review` means wait for manual approval)
- **`timeout`**: Configuration for approval timeouts

## Approval Rules

Each rule has the following structure:

```json
{
  "id": "unique-rule-id",
  "name": "Human-readable name",
  "description": "Optional description",
  "priority": 10,
  "match": {
    "tool": {
      "type": "builtin" | "mcp",
      "toolName": "ToolName",        // For builtin tools
      "serverName": "server-name",   // For MCP tools
      "optionalSpecifier": "..."     // Optional additional matching
    },
    "agentIdentity": "agent-name",   // Optional
    "inputParameters": { "key": "value" }  // Optional
  },
  "action": "approve|deny|review",
  "timeoutOverride": 60000,
  "enabled": true
}
```

### Rule Fields

- **`id`**: Unique identifier (alphanumeric with hyphens/underscores)
- **`priority`**: Lower number = higher priority (must be unique)
- **`match`**: Criteria for matching tool calls
- **`action`**: What to do when rule matches
- **`timeoutOverride`**: Optional custom timeout for this rule
- **`enabled`**: Whether the rule is active

### Tool Matching

Two types of tool matching are supported:

1. **Built-in Tools**: Standard tools provided by the MCP server

   ```json
   {
     "tool": {
       "type": "builtin",
       "toolName": "Read"
     }
   }
   ```

2. **MCP Tools**: Tools from external MCP servers
   ```json
   {
     "tool": {
       "type": "mcp",
       "serverName": "sentry",
       "toolName": "find_issues" // Optional - omit to match all tools from server
     }
   }
   ```

### Match Criteria

- **`tool`**: Required. Specifies which tool(s) to match
- **`agentIdentity`**: Optional. Match specific agent identities
- **`inputParameters`**: Optional. Match specific input parameter values

## Environment Variables

- **`CCO_CONFIG_PATH`**: Custom configuration file path (default: `~/.cco-mcp/config.json`)

## API Endpoints

### Configuration Management

- **GET** `/api/config` - Get current configuration
- **PUT** `/api/config` - Update full configuration
- **PATCH** `/api/config` - Partial configuration update
- **POST** `/api/config/validate` - Validate configuration

### Rule Management

- **GET** `/api/config/rules` - List all rules
- **POST** `/api/config/rules` - Add new rule
- **PUT** `/api/config/rules/:id` - Update rule
- **DELETE** `/api/config/rules/:id` - Delete rule
- **POST** `/api/config/rules/test` - Test rule matching

## Examples

### 1. Allow Read-Only Operations

```json
{
  "approvals": {
    "enabled": true,
    "rules": [
      {
        "id": "allow-reads",
        "name": "Auto-approve read operations",
        "priority": 10,
        "match": {
          "tool": {
            "type": "builtin",
            "toolName": "Read"
          }
        },
        "action": "approve"
      },
      {
        "id": "allow-ls",
        "name": "Auto-approve listing operations",
        "priority": 11,
        "match": {
          "tool": {
            "type": "builtin",
            "toolName": "LS"
          }
        },
        "action": "approve"
      }
    ],
    "defaultAction": "review",
    "timeout": {
      "duration": 300000,
      "defaultAction": "deny"
    }
  }
}
```

### 2. Block Dangerous Commands

```json
{
  "id": "block-dangerous",
  "name": "Block dangerous bash commands",
  "priority": 1,
  "match": {
    "tool": {
      "type": "builtin",
      "toolName": "Bash"
    },
    "inputParameters": {
      "command": "rm -rf /"
    }
  },
  "action": "deny"
}
```

### 3. Agent-Specific Rules

```json
{
  "id": "trusted-agent",
  "name": "Auto-approve trusted agent",
  "priority": 5,
  "match": {
    "tool": {
      "type": "builtin",
      "toolName": "Read"
    },
    "agentIdentity": "claude-code"
  },
  "action": "approve"
}
```

### 4. MCP Server Rules

```json
{
  "id": "allow-sentry-readonly",
  "name": "Allow Sentry read operations",
  "priority": 20,
  "match": {
    "tool": {
      "type": "mcp",
      "serverName": "sentry",
      "toolName": "find_issues"
    }
  },
  "action": "approve"
}
```

### 5. Allow All Tools from Specific MCP Server

```json
{
  "id": "trust-git-server",
  "name": "Auto-approve all git operations",
  "priority": 15,
  "match": {
    "tool": {
      "type": "mcp",
      "serverName": "git"
    }
  },
  "action": "approve"
}
```

## Testing Rules

Use the test endpoint to verify your rules:

```bash
curl -X POST http://localhost:8660/api/config/rules/test \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "Read",
    "agentIdentity": "claude-code",
    "input": { "file_path": "/tmp/test.txt" }
  }'
```

## Best Practices

1. **Start Restrictive**: Begin with `defaultAction: "review"` and add specific approval rules
2. **Use Priorities**: Order rules from most specific (low priority) to most general (high priority)
3. **Test Rules**: Use the test endpoint before deploying
4. **Document Rules**: Use meaningful names and descriptions
5. **Regular Review**: Periodically audit your rules for security

## Security Considerations

- Rules are evaluated in priority order - first match wins
- Default configuration has NO auto-approval rules
- Configuration changes are logged in the audit trail
- File watching enables hot-reload of configuration changes

## Default Configuration

By default, CCO-MCP starts with approval mode enabled and requires manual review for all requests:

```json
{
  "approvals": {
    "enabled": true,
    "rules": [],
    "defaultAction": "review",
    "timeout": {
      "duration": 300000,
      "defaultAction": "deny"
    }
  }
}
```

To allow all requests automatically (not recommended for production):

```json
{
  "approvals": {
    "enabled": true,
    "rules": [],
    "defaultAction": "approve",
    "timeout": {
      "duration": 300000,
      "defaultAction": "deny"
    }
  }
}
```

## Troubleshooting

1. **Configuration not loading**: Check file permissions and JSON syntax
2. **Rules not matching**: Use the test endpoint to debug
3. **Unexpected behavior**: Check rule priorities and ensure unique IDs
4. **Hot-reload not working**: Verify file watcher permissions
