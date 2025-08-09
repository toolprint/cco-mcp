# Claude Code Hooks Reference - CCO-MCP Implementation

This document provides a comprehensive reference for Claude Code hooks support in CCO-MCP, detailing the complete specification and implementation requirements for 100% compatibility.

## Table of Contents

1. [Overview](#overview)
2. [Hook Event Types](#hook-event-types)
3. [Permission Decisions](#permission-decisions)
4. [Exit Codes](#exit-codes)
5. [Environment Variables](#environment-variables)
6. [MCP Tool Naming](#mcp-tool-naming)
7. [Sub-agent Control](#sub-agent-control)
8. [Complete Event Schemas](#complete-event-schemas)
9. [Implementation Gaps](#implementation-gaps)
10. [Migration Guide](#migration-guide)

## Overview

Claude Code hooks provide a powerful mechanism to intercept and control various stages of Claude's execution lifecycle. CCO-MCP integrates with these hooks to provide comprehensive monitoring and approval workflows.

### Key Capabilities

- **Tool Call Interception**: Block or approve tool executions before they occur
- **Event Monitoring**: Track all Claude Code activities in real-time
- **Permission Control**: Implement approval workflows with "allow", "deny", or "ask" responses
- **Sub-agent Management**: Control sub-agent lifecycle and termination
- **Context Enhancement**: Inject additional information into prompts and sessions

## Hook Event Types

### 1. PreToolUse

Runs before tool execution. Can block or modify tool calls.

**Matchers**: Tool names (e.g., `Bash`, `Edit`, `Read`, `mcp__*`)

**Blocking**: Yes - supports "allow", "deny", "ask" responses

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "PreToolUse",
  "tool_name": "string",
  "tool_input": {}
}
```

### 2. PostToolUse

Runs after successful tool execution.

**Matchers**: Same as PreToolUse

**Blocking**: Optional - can provide feedback or log results

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "PostToolUse",
  "tool_name": "string",
  "tool_input": {},
  "tool_response": {}
}
```

### 3. UserPromptSubmit

Runs before processing user prompts. Can inject context or block prompts.

**Matchers**: `.*` (all prompts)

**Blocking**: Yes - can modify or block prompt processing

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "string"
}
```

### 4. Notification

Triggered during various system events (e.g., permission requests).

**Matchers**: Event types

**Blocking**: No - informational only

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "Notification",
  "message": "string"
}
```

### 5. Stop

Runs when main agent is about to stop.

**Matchers**: `.*`

**Blocking**: Yes - can prevent stopping or provide continuation

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "Stop",
  "stop_hook_active": true
}
```

### 6. SubagentStop

Runs when a sub-agent is about to stop.

**Matchers**: Agent names

**Blocking**: Yes - can control sub-agent lifecycle

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": true
}
```

### 7. PreCompact

Runs before context compaction.

**Matchers**: `manual`, `auto`

**Blocking**: Yes - can prevent or modify compaction

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "PreCompact",
  "trigger": "manual|auto",
  "custom_instructions": "string"
}
```

### 8. SessionStart

Triggered at session initialization.

**Matchers**: `startup`, `resume`, `clear`

**Blocking**: No - initialization hook

**Fields**:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "SessionStart",
  "source": "startup|resume|clear"
}
```

## Permission Decisions

### PreToolUse Response Format

CCO-MCP must return specific JSON responses for PreToolUse events:

#### Allow Response

```json
{
  "behavior": "allow",
  "message": "Tool execution approved"
}
```

#### Deny Response

```json
{
  "behavior": "deny",
  "message": "Tool execution denied by security policy"
}
```

#### Ask Response (Interactive Approval)

```json
{
  "behavior": "ask",
  "message": "Manual approval required for this operation"
}
```

**Important**: The "ask" behavior triggers Claude Code to prompt the user for approval. CCO-MCP currently treats "ask" as "allow" but needs to be updated for proper interactive flow.

## Exit Codes

Hook commands must use specific exit codes:

- **0**: Success - continue normal operation
- **2**: Blocking error - stop execution (for blocking hooks)
- **Other**: Non-blocking error - log and continue

### Current Implementation Gap

```rust
// Current (incorrect)
process::exit(1); // Generic error

// Required
match error_type {
    BlockingError => process::exit(2),
    NonBlockingError => process::exit(1),
    _ => process::exit(0),
}
```

## Environment Variables

Claude Code provides the following environment variable:

- **CLAUDE_PROJECT_DIR**: Absolute path to the project directory

This enables project-relative path resolution in hooks:

```rust
// Example usage
let project_dir = std::env::var("CLAUDE_PROJECT_DIR")
    .unwrap_or_else(|_| std::env::current_dir().unwrap().to_string_lossy().to_string());
```

## MCP Tool Naming

MCP (Model Context Protocol) tools follow a specific naming convention:

### Format

```
mcp__<server_name>__<tool_name>
```

### Examples

- `mcp__memory__create_entities`
- `mcp__git__commit`
- `mcp__filesystem__read_file`

### Validation Requirements

1. Must start with `mcp__`
2. Server name cannot contain `__`
3. Tool name is optional but recommended
4. Case-sensitive matching

### Current Implementation

```rust
// Parsing MCP tool names
let parts = tool_name.split("__").collect::<Vec<_>>();
if parts.len() >= 2 && parts[0] == "mcp" {
    let server_name = parts[1];
    let tool_name = parts.get(2).map(|s| s.to_string());
    // Process MCP tool
}
```

## Sub-agent Control

Sub-agents are separate Claude instances spawned for specific tasks. Hooks can control their lifecycle:

### Stop Hook Behavior

When `stop_hook_active` is true:

1. Hook receives Stop/SubagentStop event
2. Hook can return blocking response to prevent termination
3. Hook can provide continuation instructions

### Example Flow

```
1. User: "Stop"
2. Claude -> Hook: {"hook_event_name": "Stop", "stop_hook_active": true}
3. Hook -> Claude: {"behavior": "deny", "message": "Task incomplete, continue?"}
4. Claude continues execution
```

## Complete Event Schemas

### Common Fields (All Events)

```typescript
interface BaseHookEvent {
  session_id: string; // Unique session identifier
  transcript_path: string; // Path to session transcript
  cwd: string; // Current working directory
  hook_event_name: string; // Event type
}
```

### Event-Specific Fields

```typescript
// PreToolUse & PostToolUse
interface ToolEvent extends BaseHookEvent {
  tool_name: string; // Tool being executed
  tool_input: object; // Tool parameters
  tool_response?: object; // Tool output (PostToolUse only)
}

// UserPromptSubmit
interface PromptEvent extends BaseHookEvent {
  prompt: string; // User's input
}

// Notification
interface NotificationEvent extends BaseHookEvent {
  message: string; // Notification content
}

// Stop & SubagentStop
interface StopEvent extends BaseHookEvent {
  stop_hook_active: boolean; // Whether stop can be prevented
}

// PreCompact
interface CompactEvent extends BaseHookEvent {
  trigger: "manual" | "auto"; // Compaction trigger
  custom_instructions?: string; // Additional instructions
}

// SessionStart
interface SessionStartEvent extends BaseHookEvent {
  source: "startup" | "resume" | "clear"; // Session origin
}
```

## Implementation Gaps

### 1. Missing "ask" Behavior Support

**Current**:

```typescript
case 'review':
  behavior = 'allow'; // Incorrect fallback
```

**Required**:

```typescript
case 'review':
  behavior = 'ask'; // Trigger interactive approval
```

### 2. Incomplete Event Type Support

**Missing Events**:

- UserPromptSubmit
- PreCompact
- SessionStart

**Required Changes**:

1. Add event type definitions
2. Update validation logic
3. Add UI components for display

### 3. Exit Code Handling

**Current**: Generic error codes
**Required**: Specific exit code 2 for blocking errors

### 4. Environment Variable Support

**Missing**: CLAUDE_PROJECT_DIR not available to hooks
**Required**: Pass through environment variable

### 5. Timeout Handling

**Current**: Custom timeouts
**Required**: 60-second default timeout per Claude Code spec

## Migration Guide

### For CCO-MCP Users

1. **Update Configuration**:

   ```json
   {
     "approvals": {
       "rules": [
         {
           "action": "review", // Will trigger "ask" behavior
           "match": {
             "tool": {
               "type": "builtin",
               "toolName": "Bash"
             }
           }
         }
       ]
     }
   }
   ```

2. **Handle New Event Types**:

   - Monitor UserPromptSubmit for prompt injection
   - Use PreCompact for context management
   - Track SessionStart for analytics

3. **Test Exit Codes**:
   ```bash
   # Test blocking error
   echo '{"hook_event_name": "PreToolUse", ...}' | cco-hook-client
   # Should exit with code 2 on deny
   ```

### For Developers

1. **Update Event Handlers**:

   ```rust
   match event.hook_event_name.as_str() {
     "UserPromptSubmit" => handle_prompt_submit(event),
     "PreCompact" => handle_pre_compact(event),
     "SessionStart" => handle_session_start(event),
     // ... existing handlers
   }
   ```

2. **Implement Ask Flow**:

   ```rust
   impl BlockingResponse {
     pub fn ask(message: String) -> Self {
       Self {
         behavior: "ask".to_string(),
         message,
       }
     }
   }
   ```

3. **Add Comprehensive Testing**:
   ```rust
   #[test]
   fn test_ask_behavior() {
     let response = BlockingResponse::ask("Requires approval");
     assert_eq!(response.behavior, "ask");
   }
   ```

## Best Practices

### 1. Security

- Always validate tool inputs
- Sanitize file paths
- Implement rate limiting
- Log all decisions for audit

### 2. Performance

- Use 60-second timeout
- Cache approval decisions
- Minimize processing time
- Handle errors gracefully

### 3. User Experience

- Provide clear denial messages
- Use "ask" for sensitive operations
- Log context for debugging
- Support undo/rollback

### 4. Integration

- Test all event types
- Handle edge cases
- Document custom rules
- Monitor hook performance

## Troubleshooting

### Common Issues

1. **Hook Not Triggering**

   - Check Claude Code settings.json
   - Verify binary path is absolute
   - Ensure executable permissions

2. **Wrong Exit Codes**

   - Exit 2 for blocking errors only
   - Exit 0 for success
   - Exit 1 for non-blocking errors

3. **Missing Events**

   - Update to latest Claude Code
   - Check event type spelling
   - Verify matcher patterns

4. **Performance Issues**
   - Respect 60-second timeout
   - Optimize rule evaluation
   - Use connection pooling

## Future Enhancements

1. **WebSocket Support**: Real-time bidirectional communication
2. **Batch Processing**: Handle multiple events efficiently
3. **Rule Templates**: Pre-built security policies
4. **Analytics Dashboard**: Event statistics and trends
5. **Plugin System**: Extensible hook processors

This reference document will be updated as new features are added to Claude Code hooks. For the latest information, consult the official Claude Code documentation.
