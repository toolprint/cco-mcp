# Claude Code Hook Events Integration

This document outlines the integration of Claude Code hooks with CCO-MCP, enabling real-time event monitoring and automatic tool call blocking based on existing approval rules.

## Overview

CCO-MCP will support Claude Code's hook system to:
1. Display all hook events in a read-only dashboard
2. Evaluate PreToolUse events against existing approval rules
3. Block tool calls that match deny rules automatically

## Architecture

### Components

#### 1. Hook Bridge (`/hooks/bridge.js`)
A simple Node.js script that:
- Reads hook events from stdin (sent by Claude Code)
- Parses the JSON event data
- Forwards events to CCO-MCP server via HTTP POST
- Returns blocking response for PreToolUse events

```javascript
// Basic structure
process.stdin.on('data', async (data) => {
  const event = JSON.parse(data);
  const response = await fetch('http://localhost:8660/api/hooks/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  
  if (event.type === 'PreToolUse') {
    const result = await response.json();
    console.log(JSON.stringify(result));
  }
});
```

#### 2. Hook Event Service (`src/services/HookEventService.ts`)
Manages hook events with:
- In-memory storage (similar to audit log service)
- Event type enumeration and validation
- Integration with ConfigurationService for rule evaluation
- SSE event emission for dashboard updates

Key methods:
- `addEvent(event: HookEvent): void` - Store new event
- `evaluatePreToolUse(event: PreToolUseEvent): BlockingResponse` - Apply rules
- `getEvents(filters?: EventFilters): HookEvent[]` - Retrieve events
- `on('new-event', handler)` - Event subscription

#### 3. Events Dashboard (`/events`)
A new read-only dashboard tab featuring:
- Real-time event stream using SSE
- Color-coded event types:
  - PreToolUse: Blue
  - PostToolUse: Green
  - Notification: Yellow
  - Stop/SubagentStop: Red
- Expandable JSON viewer for event details
- Filter by event type, session, or time range
- No action buttons (purely observational)

### API Endpoints

#### `POST /api/hooks/event`
Receives hook events from the bridge.

Request:
```json
{
  "type": "PreToolUse",
  "sessionId": "abc123",
  "timestamp": "2024-01-01T12:00:00Z",
  "tool": {
    "name": "Bash",
    "input": {
      "command": "rm -rf /"
    }
  },
  "agentIdentity": "main"
}
```

Response (for PreToolUse only):
```json
{
  "behavior": "deny",
  "message": "Denied by rule: No destructive commands"
}
```

#### `GET /api/hooks/events`
Retrieves recent hook events with optional filters.

Query parameters:
- `type`: Filter by event type
- `sessionId`: Filter by session
- `limit`: Maximum events to return (default: 100)
- `since`: ISO timestamp for events after this time

#### SSE Extension
Add new event types to existing SSE stream:
- `hook-event`: New hook event received
- `hook-evaluation`: PreToolUse evaluation result

## PreToolUse Integration Flow

1. **Event Receipt**: Bridge sends PreToolUse event to server
2. **Rule Evaluation**:
   ```typescript
   const toolCall: ToolCallInfo = {
     toolName: event.tool.name,
     agentIdentity: event.agentIdentity,
     input: event.tool.input
   };
   
   const { action, rule } = configService.getActionForToolCall(toolCall);
   ```
3. **Response Generation**:
   - If `action === "deny"`: Return block response
   - If `action === "approve"` or `"review"`: Return allow response
4. **Event Storage**: Store event with evaluation result
5. **Dashboard Update**: Emit SSE event for real-time display

## Hook Configuration

### Claude Code Settings
Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/cco-mcp/hooks/bridge.js"
      }]
    }],
    "PostToolUse": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/cco-mcp/hooks/bridge.js"
      }]
    }],
    "Notification": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/cco-mcp/hooks/bridge.js"
      }]
    }]
  }
}
```

### Installation Script
Provide a helper script to:
1. Locate Claude Code settings file
2. Backup existing configuration
3. Add hook configuration
4. Verify bridge script path

## Event Types

### PreToolUse
```typescript
interface PreToolUseEvent {
  type: 'PreToolUse';
  sessionId: string;
  timestamp: string;
  tool: {
    name: string;
    input: Record<string, any>;
  };
  agentIdentity?: string;
}
```

### PostToolUse
```typescript
interface PostToolUseEvent {
  type: 'PostToolUse';
  sessionId: string;
  timestamp: string;
  tool: {
    name: string;
    input: Record<string, any>;
    output?: any;
    error?: string;
  };
  agentIdentity?: string;
  duration: number;
}
```

### Notification
```typescript
interface NotificationEvent {
  type: 'Notification';
  sessionId: string;
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}
```

### Stop/SubagentStop
```typescript
interface StopEvent {
  type: 'Stop' | 'SubagentStop';
  sessionId: string;
  timestamp: string;
  reason?: string;
  agentIdentity?: string;
}
```

## UI Components

### Events List Component
- Virtual scrolling for performance
- Event type badges with colors
- Timestamp formatting
- Expandable detail view

### Event Detail Component
- JSON syntax highlighting
- Copy to clipboard functionality
- Rule match information (for PreToolUse)
- Evaluation result display

### Filter Bar Component
- Event type multi-select
- Session ID search
- Date/time range picker
- Clear filters button

## Implementation Timeline

1. **Phase 1**: Hook bridge and API endpoints
2. **Phase 2**: HookEventService with rule evaluation
3. **Phase 3**: Events dashboard UI
4. **Phase 4**: SSE integration
5. **Phase 5**: Installation utilities and documentation

## Testing Strategy

1. **Unit Tests**:
   - HookEventService rule evaluation
   - API endpoint validation
   - Event filtering logic

2. **Integration Tests**:
   - Bridge to server communication
   - Rule evaluation with ConfigurationService
   - SSE event propagation

3. **E2E Tests**:
   - Full flow from hook trigger to dashboard display
   - PreToolUse blocking verification
   - Multi-event type handling

## Security Considerations

1. **Authentication**: Hook endpoints should verify requests are from local bridge
2. **Input Validation**: Strict schema validation for all hook events
3. **Rate Limiting**: Prevent event flooding
4. **Sensitive Data**: Ensure no secrets in event logs
5. **Access Control**: Events dashboard read-only by design

## Future Enhancements

1. **Event Persistence**: Optional database storage for historical analysis
2. **Advanced Filtering**: Complex queries and saved filters
3. **Export Functionality**: Download events as JSON/CSV
4. **Metrics Dashboard**: Aggregate statistics and trends
5. **Rule Testing**: Simulate PreToolUse events against rules