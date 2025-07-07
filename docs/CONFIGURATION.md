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
    "toolName": { "type": "exact|wildcard|regex", "value": "..." },
    "agentIdentity": { "type": "exact|wildcard|regex", "value": "..." },
    "inputParameters": { "key": "value" },
    "conditions": [...]
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

### Match Patterns

Three types of pattern matching are supported:

1. **`exact`**: Case-insensitive exact match
2. **`wildcard`**: Using `*` (multiple chars) and `?` (single char)
3. **`regex`**: Regular expression matching

### Advanced Conditions

For complex matching, use conditions:

```json
"conditions": [
  {
    "field": "file_path",
    "operator": "startsWith",
    "value": "/tmp/",
    "caseSensitive": false
  }
]
```

Operators:
- `equals`: Exact match
- `contains`: Substring match
- `startsWith`: Prefix match
- `endsWith`: Suffix match
- `matches`: Regex match
- `in`: Value in array
- `notIn`: Value not in array

## Environment Variables

- **`CCO_AUTO_APPROVE`**: Set to `"true"` to enable auto-approval (backward compatible)
- **`CCO_APPROVAL_TIMEOUT`**: Override timeout in milliseconds
- **`CCO_CONFIG_PATH`**: Custom configuration file path

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
          "toolName": {
            "type": "regex",
            "value": "^(Read|LS|Glob|Grep)$"
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
    "toolName": { "type": "exact", "value": "Bash" },
    "conditions": [{
      "field": "command",
      "operator": "matches",
      "value": "(rm|dd|mkfs|shutdown)"
    }]
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
    "agentIdentity": {
      "type": "exact",
      "value": "claude-code"
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

## Migration from Environment Variables

If you were using `CCO_AUTO_APPROVE=true`, the system will:
1. Enable the approval system
2. Use an empty rule set
3. Apply the default action to all requests

To maintain the old behavior:
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