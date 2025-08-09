# Unified Audit Stream Design for CCO-MCP

## Overview

This document describes the design for unifying the audit streams between MCP approval_prompt and Claude Code hook events, ensuring all tool approval decisions are tracked in a single audit trail.

## Current State

### MCP Approval Flow

- Creates audit log entries for every tool call
- Polls audit log for manual approval decisions
- Updates audit entry state (APPROVED/DENIED/NEEDS_REVIEW)
- Provides async approval workflow

### Hook Events Flow

- Stores events separately in HookEventService
- Returns immediate response (allow/deny/ask)
- Uses same ConfigurationService rules
- No audit log integration

## Problem Statement

1. **Fragmented audit trail**: Tool approvals are split between two systems
2. **Incomplete tracking**: Hook events with auto-approval/denial are not audited
3. **Lost decisions**: User responses to 'ask' prompts are not tracked
4. **Inconsistent UI**: Two separate views for essentially the same function

## How 'ask' Behavior Works

Based on Claude Code documentation and testing:

1. Hook returns `{"behavior": "ask", "message": "reason"}`
2. Claude Code shows a UI prompt to the user
3. User clicks Allow/Deny in Claude Code UI
4. **No follow-up event** is sent to the hook
5. If approved, the tool executes and PostToolUse fires
6. If denied, no further events occur

## Proposed Solution

### Architecture Changes

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│ Hook Event       │────▶│ Audit Service   │
│  Hook Events    │     │ Service          │     │ (Unified)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                          ▲
                                ▼                          │
                        ┌──────────────────┐              │
                        │ Configuration    │              │
                        │ Service          │              │
                        └──────────────────┘              │
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  MCP approval   │────▶│ MCP Server       │─────────────┘
│  _prompt tool   │     │                  │
└─────────────────┘     └──────────────────┘
```

### Implementation Details

#### 1. Modify HookEventService

```typescript
class HookEventService extends EventEmitter {
  private auditService: IAuditLogService;

  async addEvent(event: HookEvent): Promise<StoredHookEvent> {
    const storedEvent = // ... existing logic

    // Create audit entry for PreToolUse events
    if (event.hook_event_name === 'PreToolUse') {
      const auditEntry = await this.auditService.addEntry(
        event.tool_name || 'Unknown',
        event.tool_input || {},
        'claude-code-hook' // Special identifier
      );

      storedEvent.auditEntryId = auditEntry.id;

      // Evaluate and update audit entry
      const evaluation = await this.evaluatePreToolUse(event);
      await this.updateAuditEntry(auditEntry.id, evaluation);
    }

    return storedEvent;
  }

  private async updateAuditEntry(
    entryId: string,
    evaluation: HookEvaluationResult
  ): Promise<void> {
    switch (evaluation.behavior) {
      case 'allow':
        await this.auditService.updateEntry(
          entryId,
          'APPROVED',
          evaluation.ruleName ? `rule:${evaluation.ruleId}` : 'rule:default'
        );
        break;

      case 'deny':
        await this.auditService.updateEntry(
          entryId,
          'DENIED',
          evaluation.ruleName ? `rule:${evaluation.ruleId}` : 'rule:default'
        );
        break;

      case 'ask':
        // Leave in NEEDS_REVIEW state for user decision
        // Track that we're waiting for Claude Code UI response
        await this.auditService.addMetadata(entryId, {
          waitingForUserResponse: true,
          askMessage: evaluation.message
        });
        break;
    }
  }
}
```

#### 2. Track User Decisions

Since Claude Code doesn't send follow-up events, we'll use inference:

```typescript
// In PostToolUse handler
async handlePostToolUse(event: HookEvent): Promise<void> {
  // Find matching PreToolUse event
  const preToolEvent = await this.findMatchingPreToolUse(
    event.session_id,
    event.tool_name
  );

  if (preToolEvent?.evaluation?.behavior === 'ask') {
    // Tool executed = user approved in Claude Code UI
    await this.auditService.updateEntry(
      preToolEvent.auditEntryId,
      'APPROVED',
      'user:claude-code-ui'
    );
  }
}

// Periodic cleanup for unresolved 'ask' states
async cleanupPendingDecisions(): Promise<void> {
  const pendingEntries = await this.auditService.queryEntries({
    state: 'NEEDS_REVIEW',
    metadata: { waitingForUserResponse: true },
    olderThan: '5m'
  });

  for (const entry of pendingEntries) {
    // No PostToolUse = likely denied by user
    await this.auditService.updateEntry(
      entry.id,
      'DENIED',
      'inferred:timeout-no-execution'
    );
  }
}
```

#### 3. Unified Audit Entry Model

```typescript
interface UnifiedAuditEntry extends AuditLogEntry {
  // Source of the approval request
  source: "mcp" | "hook";

  // Hook-specific fields
  hookEventId?: string;
  sessionId?: string;

  // Metadata for tracking
  metadata?: {
    waitingForUserResponse?: boolean;
    askMessage?: string;
    inferredDecision?: boolean;
  };
}
```

#### 4. Update UI Components

```typescript
// Unified query API
interface UnifiedAuditQuery {
  includeHookEvents: boolean;
  includeMcpEvents: boolean;
  // ... other filters
}

// Update dashboard to show source
<Badge variant={entry.source === 'hook' ? 'secondary' : 'default'}>
  {entry.source === 'hook' ? 'Hook' : 'MCP'}
</Badge>

// Show inference indicator
{entry.metadata?.inferredDecision && (
  <Tooltip content="Decision inferred from tool execution">
    <InfoIcon className="w-4 h-4 text-gray-400" />
  </Tooltip>
)}
```

## Benefits

1. **Complete audit trail**: All tool approval decisions in one place
2. **Compliance ready**: Full history of automated and manual decisions
3. **Better insights**: Understand tool usage patterns across all sources
4. **Unified UI**: Single dashboard for all approval activities
5. **Consistent rules**: Same approval logic for all tool calls

## Limitations

1. **'ask' tracking**: Cannot guarantee 100% accuracy for user decisions
2. **Performance**: Slight overhead from creating audit entries
3. **Storage**: Increased audit log size from hook events

## Migration Strategy

1. **Phase 1**: Add audit integration to HookEventService (backward compatible)
2. **Phase 2**: Update UI to show unified view (opt-in)
3. **Phase 3**: Migrate existing hook events to audit log (optional)

## Configuration

```json
{
  "unifiedAudit": {
    "enabled": true,
    "includeHookEvents": true,
    "inferUserDecisions": true,
    "inferenceTimeoutMs": 300000
  }
}
```

## Future Enhancements

1. **Claude Code API**: Request follow-up events for 'ask' decisions
2. **Webhooks**: Send audit events to external systems
3. **Analytics**: Advanced reporting on approval patterns
4. **Batch operations**: Bulk approve/deny from unified view

## Conclusion

This unified audit stream design provides a comprehensive solution for tracking all tool approval decisions in CCO-MCP, while working within the constraints of Claude Code's current hook implementation. The design maintains backward compatibility while providing significant improvements in visibility and compliance.
