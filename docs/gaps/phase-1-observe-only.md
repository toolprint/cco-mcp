# Phase 1: Observe-Only Mode Implementation

## Overview

Phase 1 establishes the foundation for the migration by implementing an "observe-only" mode where the cco-mcp frontend displays audit history and real-time updates from the superego-mcp backend. No manual approvals are supported in this phase - all decisions are made automatically by the AI evaluation engine.

## Goals

- ✅ Validate integration architecture between frontend and backend
- ✅ Enable monitoring and observation of AI decision patterns  
- ✅ Identify gaps in rule configuration through real usage
- ✅ Establish SSE streaming for real-time updates
- ✅ Provide foundation for subsequent phases

## Architecture Changes

### Backend Extensions (superego-mcp)

#### 1. Enhanced Audit Entry Model

**Current Model**: Basic in-memory logging in `AuditLogger`
**New Model**: Extended audit entry with UI compatibility

```python
# File: src/superego_mcp/domain/models.py

from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from enum import Enum

class AuditEntryState(Enum):
    """States for audit entries aligned with hook schema"""
    COMPLETED = "completed"      # Decision made (allow/deny)
    ASK = "ask"                 # Awaiting escalation (agent/human)
    APPROVED = "approved"        # Human approved after ASK
    DENIED = "denied"           # Human denied after ASK
    TIMEOUT = "timeout"         # Timeout occurred during ASK

class AuditEntry(BaseModel):
    """Unified audit entry with decision tracking"""
    id: str
    timestamp: datetime
    tool_name: str
    tool_input: Dict[str, Any]
    agent_identity: Optional[str]
    session_id: str
    cwd: Optional[str]
    
    # Core decision (matches hook schema)
    decision: Decision  # Contains action (allow/deny/ask), reason, and metadata
    
    # State management
    state: AuditEntryState = Field(default=AuditEntryState.COMPLETED)
    expires_at: datetime = Field(default_factory=lambda: datetime.now() + timedelta(hours=24))
    
    # Rule information
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None

    def to_cco_format(self) -> Dict[str, Any]:
        """Convert to CCO-MCP frontend expected format"""
        result = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "agent_identity": self.agent_identity,
            "state": self.state.value.upper(),
            "expires_at": self.expires_at.isoformat(),
            "decision_action": self.decision.action,
            "decision_reason": self.decision.reason,
            "rule_id": self.rule_id,
            "rule_name": self.rule_name
        }
        
        # Add optional metadata if present
        if self.decision.agent_metadata:
            result["decision_confidence"] = self.decision.agent_metadata.confidence
            result["decision_by"] = "ai_agent"
        if self.decision.observability:
            result["processing_time_ms"] = self.decision.observability.processing_time_ms
            result["decision_time"] = self.decision.observability.timestamp.isoformat()
        if self.decision.human_metadata:
            result["decision_by"] = "human"
            result["resolved_by"] = self.decision.human_metadata.resolved_by
        
        return result
```

#### 2. In-Memory Audit Storage (Phase 1 Observe-Only)

```python
# File: src/superego_mcp/infrastructure/audit_storage.py

import asyncio
from collections import OrderedDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel

class InMemoryAuditStorage:
    """Pure in-memory storage for Phase 1 observe-only mode
    
    Simple, fast, and sufficient for observe-only functionality.
    No persistence needed as we're just monitoring AI decisions.
    """
    
    def __init__(self, max_entries: int = 10000):
        self.entries = OrderedDict()  # Preserves insertion order, O(1) access
        self.max_entries = max_entries
        self._lock = asyncio.Lock()
        self._expiry_check_counter = 0
    
    async def add_entry(self, entry: AuditEntry) -> None:
        """Add new audit entry to memory store"""
        async with self._lock:
            # FIFO eviction if at capacity
            if len(self.entries) >= self.max_entries:
                self.entries.popitem(last=False)  # Remove oldest
            
            self.entries[entry.id] = entry
            
            # Periodic expired entry cleanup (every 100 entries)
            self._expiry_check_counter += 1
            if self._expiry_check_counter >= 100:
                self._expiry_check_counter = 0
                await self._cleanup_expired()
    
    async def get_entry(self, entry_id: str) -> Optional[AuditEntry]:
        """Get specific audit entry by ID"""
        async with self._lock:
            return self.entries.get(entry_id)
    
    async def query_entries(
        self,
        state: Optional[str] = None,
        agent_identity: Optional[str] = None,
        tool_name: Optional[str] = None,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Query audit entries with filtering and pagination"""
        async with self._lock:
            # Filter entries in memory
            filtered = []
            for entry in self.entries.values():
                # Apply filters
                if state and entry.state.value.upper() != state.upper():
                    continue
                if agent_identity and entry.agent_identity != agent_identity:
                    continue
                if tool_name and entry.tool_name != tool_name:
                    continue
                if search and not self._matches_search(entry, search):
                    continue
                
                filtered.append(entry)
            
            # Sort by timestamp (newest first)
            filtered.sort(key=lambda e: e.timestamp, reverse=True)
            
            # Apply pagination
            total = len(filtered)
            paginated = filtered[offset:offset + limit]
            
            return {
                "entries": [entry.to_cco_format() for entry in paginated],
                "total": total,
                "offset": offset,
                "limit": limit,
                "hasMore": offset + limit < total
            }
    
    def _matches_search(self, entry: AuditEntry, search: str) -> bool:
        """Check if entry matches search terms"""
        search_lower = search.lower()
        return (
            search_lower in entry.tool_name.lower() or
            search_lower in entry.decision.reason.lower() or
            search_lower in str(entry.tool_input).lower() or
            (entry.agent_identity and search_lower in entry.agent_identity.lower())
        )
    
    async def _cleanup_expired(self) -> None:
        """Remove expired entries from memory"""
        now = datetime.now()
        expired_ids = [
            entry_id for entry_id, entry in self.entries.items()
            if entry.expires_at < now
        ]
        for entry_id in expired_ids:
            del self.entries[entry_id]
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        async with self._lock:
            return {
                "total_entries": len(self.entries),
                "max_entries": self.max_entries,
                "capacity_used": len(self.entries) / self.max_entries,
                "oldest_entry": next(iter(self.entries.values())).timestamp if self.entries else None,
                "newest_entry": list(self.entries.values())[-1].timestamp if self.entries else None
            }
```

#### 3. New API Endpoints

```python
# File: src/superego_mcp/presentation/unified_server.py

# Add these endpoints to the _setup_fastapi_routes method:

@self.fastapi.get("/v1/audit")
async def query_audit_entries(
    state: Optional[str] = None,
    agent_identity: Optional[str] = None,
    tool_name: Optional[str] = None,
    search: Optional[str] = None,
    offset: int = 0,
    limit: int = 100
) -> Dict[str, Any]:
    """Query audit entries with filtering and pagination (Phase 1)"""
    try:
        result = await self.audit_storage.query_entries(
            state=state,
            agent_identity=agent_identity,
            tool_name=tool_name,
            search=search,
            offset=offset,
            limit=limit
        )
        return result
    except Exception as e:
        logger.error("Failed to query audit entries", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.get("/v1/audit/{entry_id}")
async def get_audit_entry(entry_id: str) -> Dict[str, Any]:
    """Get specific audit entry by ID"""
    try:
        entry = await self.audit_storage.get_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Audit entry not found")
        
        return {"entry": entry.to_cco_format()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get audit entry", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.get("/v1/audit/status")
async def get_audit_status() -> Dict[str, Any]:
    """Get audit system status"""
    try:
        # Get basic statistics
        all_entries = await self.audit_storage.query_entries(limit=10000)
        
        total_entries = all_entries["total"]
        if total_entries == 0:
            return {
                "total_entries": 0,
                "auto_approval_enabled": True,  # Phase 1: always auto
                "approval_timeout_ms": 0  # Phase 1: no timeouts
            }
        
        # Calculate approval rate
        allow_count = sum(1 for entry in all_entries["entries"] 
                         if entry.get("decision_action") == "allow")
        
        return {
            "total_entries": total_entries,
            "auto_approval_enabled": True,  # Phase 1: always true
            "approval_timeout_ms": 0,  # Phase 1: no manual approvals
            "allow_rate": allow_count / total_entries if total_entries > 0 else 0,
            "deny_rate": 1 - (allow_count / total_entries) if total_entries > 0 else 0
        }
    except Exception as e:
        logger.error("Failed to get audit status", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

#### 4. SSE Event Streaming

```python
# File: src/superego_mcp/presentation/sse_events.py

from fastapi import Request
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
import json
import asyncio

class AuditEventStreamer:
    """SSE event streaming for audit log updates"""
    
    def __init__(self, audit_storage: InMemoryAuditStorage):
        self.audit_storage = audit_storage
        self.subscribers: set[asyncio.Queue] = set()
    
    async def subscribe(self) -> asyncio.Queue:
        """Subscribe to audit events"""
        queue = asyncio.Queue()
        self.subscribers.add(queue)
        return queue
    
    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Unsubscribe from audit events"""
        self.subscribers.discard(queue)
    
    async def broadcast_new_entry(self, entry: AuditEntry) -> None:
        """Broadcast new audit entry to all subscribers"""
        event_data = {
            "type": "new-entry",
            "entry": entry.to_cco_format()
        }
        
        closed_queues = set()
        for queue in self.subscribers.copy():
            try:
                await queue.put(event_data)
            except Exception:
                closed_queues.add(queue)
        
        # Remove closed queues
        for queue in closed_queues:
            self.subscribers.discard(queue)

# Add to unified_server.py:

@self.fastapi.get("/v1/events/stream")
async def audit_event_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events stream for audit log updates"""
    
    async def event_generator() -> AsyncGenerator[str, None]:
        # Subscribe to events
        queue = await self.event_streamer.subscribe()
        
        try:
            # Send initial connection event
            yield f"event: connected\\ndata: {json.dumps({\"message\": \"Connected to audit stream\"})}\\n\\n"
            
            # Send heartbeat and events
            while True:
                try:
                    # Wait for event with timeout for heartbeat
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    yield f"event: {event['type']}\\n"
                    yield f"data: {json.dumps(event)}\\n\\n"
                    
                except asyncio.TimeoutError:
                    # Send heartbeat
                    yield f"event: heartbeat\\ndata: {json.dumps({\"timestamp\": datetime.now().isoformat()})}\\n\\n"
                
        except asyncio.CancelledError:
            # Client disconnected
            pass
        finally:
            self.event_streamer.unsubscribe(queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )
```

#### 5. Integration with Existing Decision Flow

```python
# File: src/superego_mcp/presentation/unified_server.py

# Modify the _evaluate_internal method to use enhanced audit storage:

async def _evaluate_internal(
    self,
    tool_name: str,
    parameters: dict[str, Any],
    agent_id: str,
    session_id: str,
    cwd: str | None = None,
) -> Decision:
    """Enhanced evaluation with audit entry creation"""
    try:
        tool_request = ToolRequest(
            tool_name=tool_name,
            parameters=parameters,
            agent_id=agent_id,
            session_id=session_id,
            cwd=cwd or "/tmp",
        )

        # Perform AI evaluation
        decision = await self.security_policy.evaluate(tool_request)
        
        # Create enhanced audit entry
        audit_entry = AuditEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            tool_name=tool_name,
            tool_input=parameters,
            agent_identity=agent_id,
            session_id=session_id,
            cwd=cwd,
            decision_action=decision.action,
            decision_reason=decision.reason,
            decision_confidence=decision.confidence,
            processing_time_ms=decision.processing_time_ms,
            rule_id=decision.rule_id,
            rule_name=None,  # TODO: Add rule name lookup
            decision_by="ai_system",
            decision_time=datetime.now()
        )
        
        # Store audit entry
        await self.audit_storage.add_entry(audit_entry)
        
        # Broadcast to SSE subscribers
        await self.event_streamer.broadcast_new_entry(audit_entry)
        
        return decision

    except Exception as e:
        # Handle errors and create audit entry for failures
        fallback_decision = self.error_handler.handle_error(e, tool_request)
        
        # Create audit entry for error case
        error_audit_entry = AuditEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            tool_name=tool_name,
            tool_input=parameters,
            agent_identity=agent_id,
            session_id=session_id,
            cwd=cwd,
            decision_action=fallback_decision.action,
            decision_reason=f"Error: {fallback_decision.reason}",
            decision_confidence=fallback_decision.confidence,
            processing_time_ms=fallback_decision.processing_time_ms,
            rule_id=None,
            rule_name="error_fallback",
            decision_by="error_handler",
            decision_time=datetime.now()
        )
        
        await self.audit_storage.add_entry(error_audit_entry)
        await self.event_streamer.broadcast_new_entry(error_audit_entry)
        
        return fallback_decision
```

### Frontend Adaptations (cco-mcp)

#### 1. API Configuration Update

```typescript
// File: ui/src/config/api.ts (new file)

export const API_CONFIG = {
  // Phase 1: Point to superego-mcp backend
  BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080',
  
  // Endpoint mappings
  ENDPOINTS: {
    AUDIT_LOG: '/v1/audit',
    AUDIT_ENTRY: '/v1/audit',
    AUDIT_STATUS: '/v1/audit/status',
    AUDIT_STREAM: '/v1/events/stream',
    // Phase 1: These endpoints will return 501 Not Implemented
    AUDIT_APPROVE: '/v1/audit/{id}/approve',  // Future
    AUDIT_DENY: '/v1/audit/{id}/deny',        // Future
    CONFIG: '/v1/config/rules',               // Future
  },
  
  // Phase 1: Feature flags
  FEATURES: {
    MANUAL_APPROVALS: false,  // Disable approve/deny buttons
    CONFIG_MANAGEMENT: false, // Disable configuration UI
    OBSERVE_ONLY: true        // Show observe-only indicators
  }
}
```

#### 2. API Hook Adaptations

```typescript
// File: ui/src/hooks/useAuditLog.ts

// Modify existing hook to work with new API format:

export function useAuditLog(params: AuditLogQueryParams = {}) {
  const [data, setData] = useState<AuditLogQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();

      if (params.state) queryParams.append("state", params.state);
      if (params.agent_identity)
        queryParams.append("agent_identity", params.agent_identity);
      if (params.search) queryParams.append("search", params.search);
      if (params.offset !== undefined)
        queryParams.append("offset", params.offset.toString());
      if (params.limit !== undefined)
        queryParams.append("limit", params.limit.toString());

      // Updated endpoint
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUDIT_LOG}?${queryParams}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      
      // Map superego format to expected format if needed
      const mappedData = {
        entries: responseData.entries || [],
        total: responseData.total || 0,
        hasMore: responseData.hasMore || false,
        offset: responseData.offset || 0,
        limit: responseData.limit || 100
      };
      
      setData(mappedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [
    params.state,
    params.agent_identity,
    params.search,
    params.offset,
    params.limit,
  ]);

  // Phase 1: Disable manual actions
  const approve = useCallback(
    async (id: string) => {
      if (!API_CONFIG.FEATURES.MANUAL_APPROVALS) {
        setError("Manual approvals not available in observe-only mode");
        return;
      }
      
      // Future implementation
      throw new Error("Not implemented in Phase 1");
    },
    [fetchData]
  );

  const deny = useCallback(
    async (id: string) => {
      if (!API_CONFIG.FEATURES.MANUAL_APPROVALS) {
        setError("Manual denials not available in observe-only mode");
        return;
      }
      
      // Future implementation  
      throw new Error("Not implemented in Phase 1");
    },
    [fetchData]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    entries: data?.entries || [],
    total: data?.total || 0,
    hasMore: data?.hasMore || false,
    loading,
    error,
    refetch: fetchData,
    approve,
    deny,
    // Phase 1: Add feature flags
    canApprove: API_CONFIG.FEATURES.MANUAL_APPROVALS,
    canDeny: API_CONFIG.FEATURES.MANUAL_APPROVALS,
    isObserveOnly: API_CONFIG.FEATURES.OBSERVE_ONLY
  };
}
```

#### 3. SSE Hook Adaptation

```typescript
// File: ui/src/hooks/useAuditLogSSE.ts

import { useEffect, useState, useRef } from 'react';
import { API_CONFIG } from '../config/api';

export function useAuditLogSSE(filters: AuditLogFilters = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);

  useEffect(() => {
    // Build filter query string
    const queryParams = new URLSearchParams();
    if (filters.state) queryParams.append('state', filters.state);
    if (filters.agent_identity) queryParams.append('agent_identity', filters.agent_identity);
    if (filters.tool_name) queryParams.append('tool_name', filters.tool_name);

    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUDIT_STREAM}?${queryParams}`;
    
    // Create EventSource connection
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener('connected', (event) => {
      console.log('SSE connected:', event.data);
    });

    eventSource.addEventListener('new-entry', (event) => {
      try {
        const entry = JSON.parse(event.data);
        setLastEvent({ type: 'new-entry', data: entry });
      } catch (err) {
        console.error('Failed to parse new-entry event:', err);
      }
    });

    eventSource.addEventListener('heartbeat', (event) => {
      // Keep connection alive
    });

    eventSource.onerror = (event) => {
      setIsConnected(false);
      setError('SSE connection error');
      console.error('SSE error:', event);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [filters]);

  return {
    isConnected,
    error,
    lastEvent,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };
}
```

#### 4. UI Component Adaptations

```typescript
// File: ui/src/components/AuditLogEntry.tsx

// Add observe-only indicators to existing component:

interface AuditLogEntryProps {
  entry: AuditLogEntry;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  // Phase 1: Add new props
  isObserveOnly?: boolean;
  canApprove?: boolean;
  canDeny?: boolean;
}

export function AuditLogEntry({ 
  entry, 
  onApprove, 
  onDeny,
  isObserveOnly = false,
  canApprove = false,
  canDeny = false 
}: AuditLogEntryProps) {
  // Existing render logic...
  
  return (
    <div className="audit-entry">
      {/* Existing entry display */}
      
      {/* Phase 1: Show observe-only indicators */}
      {isObserveOnly && (
        <div className="observe-only-banner">
          <InfoIcon className="w-4 h-4" />
          <span>Observe-Only Mode - Decisions made automatically by AI</span>
        </div>
      )}
      
      {/* Modified action buttons */}
      <div className="action-buttons">
        <button
          onClick={() => onApprove?.(entry.id)}
          disabled={!canApprove}
          className={`approve-btn ${!canApprove ? 'disabled' : ''}`}
          title={!canApprove ? "Manual approvals not available in observe-only mode" : "Approve"}
        >
          Approve
        </button>
        <button
          onClick={() => onDeny?.(entry.id)}
          disabled={!canDeny}
          className={`deny-btn ${!canDeny ? 'disabled' : ''}`}
          title={!canDeny ? "Manual denials not available in observe-only mode" : "Deny"}
        >
          Deny
        </button>
      </div>
      
      {/* Phase 1: Show AI decision details */}
      {entry.decision_confidence && (
        <div className="ai-decision-details">
          <span className="confidence">
            AI Confidence: {(entry.decision_confidence * 100).toFixed(1)}%
          </span>
          <span className="processing-time">
            Processing: {entry.processing_time_ms}ms
          </span>
          {entry.rule_name && (
            <span className="rule-applied">
              Rule: {entry.rule_name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

## Testing Strategy

### Backend Testing

#### 1. Unit Tests
```python
# File: tests/test_audit_storage.py

import pytest
from datetime import datetime, timedelta
from superego_mcp.infrastructure.audit_storage import InMemoryAuditStorage, AuditEntry, AuditEntryState

@pytest.mark.asyncio
async def test_add_and_query_entries():
    storage = InMemoryAuditStorage(max_entries=100)
    
    # Create test entry
    entry = AuditEntry(
        id="test-1",
        timestamp=datetime.now(),
        tool_name="Read",
        tool_input={"file_path": "/test"},
        agent_identity="test_agent",
        session_id="test_session",
        cwd="/tmp",
        decision_action="allow",
        decision_reason="Safe read operation",
        decision_confidence=0.9,
        processing_time_ms=100,
        rule_id="rule-1",
    )
    
    # Add entry
    await storage.add_entry(entry)
    
    # Query all entries
    result = await storage.query_entries(limit=10)
    assert result["total"] == 1
    assert len(result["entries"]) == 1
    assert result["entries"][0]["id"] == "test-1"

@pytest.mark.asyncio 
async def test_filtering():
    storage = InMemoryAuditStorage()
    
    # Add multiple entries
    entries = [
        AuditEntry(
            id="read-1", tool_name="Read", agent_identity="agent1",
            timestamp=datetime.now(), tool_input={}, session_id="s1", cwd="/tmp",
            decision_action="allow", decision_reason="test", decision_confidence=0.8,
            processing_time_ms=50
        ),
        AuditEntry(
            id="write-1", tool_name="Write", agent_identity="agent2", 
            timestamp=datetime.now(), tool_input={}, session_id="s2", cwd="/tmp",
            decision_action="deny", decision_reason="test", decision_confidence=0.9,
            processing_time_ms=75
        )
    ]
    
    for entry in entries:
        await storage.add_entry(entry)
    
    # Test tool_name filter
    result = await storage.query_entries(tool_name="Read")
    assert result["total"] == 1
    assert result["entries"][0]["id"] == "read-1"
    
    # Test agent_identity filter  
    result = await storage.query_entries(agent_identity="agent2")
    assert result["total"] == 1
    assert result["entries"][0]["id"] == "write-1"
```

#### 2. Integration Tests
```python
# File: tests/test_audit_api.py

import pytest
from fastapi.testclient import TestClient
from superego_mcp.presentation.unified_server import UnifiedServer

@pytest.fixture
def test_client():
    # Create test server instance
    server = UnifiedServer(
        security_policy=MockSecurityPolicy(),
        audit_logger=MockAuditLogger(),
        error_handler=MockErrorHandler(),
        health_monitor=MockHealthMonitor(),
        config=MockConfig()
    )
    
    return TestClient(server.fastapi)

def test_query_audit_entries(test_client):
    # Test basic query
    response = test_client.get("/v1/audit")
    assert response.status_code == 200
    
    data = response.json()
    assert "entries" in data
    assert "total" in data
    assert "hasMore" in data

def test_query_with_filters(test_client):
    # Test with filters
    response = test_client.get("/v1/audit?tool_name=Read&limit=10")
    assert response.status_code == 200
    
    data = response.json()
    assert data["limit"] == 10

def test_get_specific_entry(test_client):
    # First add an entry through evaluation
    eval_response = test_client.post("/v1/evaluate", json={
        "tool_name": "Read",
        "parameters": {"file_path": "/test"},
        "agent_id": "test_agent",
        "session_id": "test_session"
    })
    assert eval_response.status_code == 200
    
    # Query to get the entry ID
    query_response = test_client.get("/v1/audit?limit=1")
    entries = query_response.json()["entries"]
    assert len(entries) > 0
    
    entry_id = entries[0]["id"]
    
    # Get specific entry
    response = test_client.get(f"/v1/audit/{entry_id}")
    assert response.status_code == 200
    
    data = response.json()
    assert "entry" in data
    assert data["entry"]["id"] == entry_id
```

#### 3. SSE Tests
```python
# File: tests/test_sse_streaming.py

import pytest
import asyncio
from superego_mcp.presentation.sse_events import AuditEventStreamer

@pytest.mark.asyncio
async def test_sse_subscription():
    storage = MockAuditStorage()
    streamer = AuditEventStreamer(storage)
    
    # Subscribe to events
    queue = await streamer.subscribe()
    
    # Create test entry
    entry = AuditEntry(
        id="test-event",
        timestamp=datetime.now(),
        tool_name="Test",
        tool_input={},
        session_id="test",
        cwd="/tmp",
        decision_action="allow",
        decision_reason="test",
        decision_confidence=0.8,
        processing_time_ms=100
    )
    
    # Broadcast event
    await streamer.broadcast_new_entry(entry)
    
    # Check event received
    event = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert event["type"] == "new-entry"
    assert event["entry"]["id"] == "test-event"
    
    # Unsubscribe
    streamer.unsubscribe(queue)
```

### Frontend Testing

#### 1. Component Tests
```typescript
// File: ui/src/components/__tests__/AuditLogEntry.test.tsx

import { render, screen } from '@testing-library/react';
import { AuditLogEntry } from '../AuditLogEntry';

describe('AuditLogEntry', () => {
  const mockEntry = {
    id: 'test-1',
    timestamp: '2024-01-01T00:00:00Z',
    tool_name: 'Read',
    tool_input: { file_path: '/test' },
    state: 'COMPLETED',
    decision_action: 'allow',
    decision_reason: 'Safe read operation',
    decision_confidence: 0.9,
    processing_time_ms: 100
  };

  it('renders in observe-only mode', () => {
    render(
      <AuditLogEntry 
        entry={mockEntry} 
        isObserveOnly={true}
        canApprove={false}
        canDeny={false}
      />
    );
    
    expect(screen.getByText(/Observe-Only Mode/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeDisabled();
  });

  it('shows AI decision details', () => {
    render(<AuditLogEntry entry={mockEntry} isObserveOnly={true} />);
    
    expect(screen.getByText(/AI Confidence: 90.0%/)).toBeInTheDocument();
    expect(screen.getByText(/Processing: 100ms/)).toBeInTheDocument();
  });
});
```

#### 2. Hook Tests
```typescript
// File: ui/src/hooks/__tests__/useAuditLog.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { useAuditLog } from '../useAuditLog';

// Mock fetch
global.fetch = jest.fn();

describe('useAuditLog', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('fetches audit entries from new endpoint', async () => {
    const mockResponse = {
      entries: [
        {
          id: 'test-1',
          tool_name: 'Read',
          decision_action: 'allow'
        }
      ],
      total: 1,
      hasMore: false
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const { result } = renderHook(() => useAuditLog());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe('test-1');
    expect(result.current.canApprove).toBe(false);
    expect(result.current.isObserveOnly).toBe(true);
  });

  it('disables manual actions in observe-only mode', () => {
    const { result } = renderHook(() => useAuditLog());
    
    expect(() => result.current.approve('test-1')).toThrow('Not implemented in Phase 1');
    expect(() => result.current.deny('test-1')).toThrow('Not implemented in Phase 1');
  });
});
```

#### 3. SSE Integration Tests
```typescript
// File: ui/src/hooks/__tests__/useAuditLogSSE.test.ts

import { renderHook } from '@testing-library/react';
import { useAuditLogSSE } from '../useAuditLogSSE';

// Mock EventSource
class MockEventSource {
  url: string;
  onopen?: () => void;
  onerror?: () => void;
  
  constructor(url: string) {
    this.url = url;
    // Simulate connection
    setTimeout(() => this.onopen?.(), 10);
  }
  
  addEventListener(event: string, handler: (e: any) => void) {
    if (event === 'connected') {
      setTimeout(() => handler({ data: '{"message": "Connected"}' }), 20);
    }
  }
  
  close() {}
}

global.EventSource = MockEventSource as any;

describe('useAuditLogSSE', () => {
  it('connects to SSE stream', async () => {
    const { result, waitFor } = renderHook(() => useAuditLogSSE());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });
});
```

## Deployment Plan

### 1. Development Setup
```bash
# Backend (superego-mcp)
cd /Users/brian/workspace/toolprint/superego-mcp
pip install -e .
python -m superego_mcp.main --transport http --port 8080

# Frontend (cco-mcp)
cd /Users/brian/workspace/toolprint/cco-mcp
npm install
REACT_APP_API_BASE_URL=http://localhost:8080 npm run dev
```

### 2. Environment Configuration
```bash
# superego-mcp/.env
PYTHONPATH=/Users/brian/workspace/toolprint/superego-mcp/src
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
LOG_LEVEL=INFO

# cco-mcp/.env
REACT_APP_API_BASE_URL=http://localhost:8080
REACT_APP_OBSERVE_ONLY=true
REACT_APP_MANUAL_APPROVALS=false
```

### 3. Verification Checklist

- [ ] Backend starts without errors on port 8080
- [ ] `/v1/audit` endpoint returns empty list initially
- [ ] `/v1/events/stream` SSE endpoint accepts connections
- [ ] Frontend loads and displays "observe-only mode" indicator
- [ ] Approve/Deny buttons are disabled with appropriate tooltips
- [ ] SSE connection indicator shows "connected"
- [ ] Make a test tool call through Claude Code hooks
- [ ] Verify audit entry appears in frontend immediately
- [ ] Verify entry details show AI confidence and processing time
- [ ] Test filtering and pagination in audit log
- [ ] Verify SSE events are received for new entries

## Success Criteria

### Functional Requirements ✅
- [ ] Frontend displays audit history from superego-mcp backend
- [ ] Real-time updates work via SSE
- [ ] All AI decisions are logged and visible
- [ ] Filtering and pagination work correctly
- [ ] Manual approval buttons are disabled with clear messaging
- [ ] Observe-only mode is clearly indicated in UI

### Performance Requirements ✅
- [ ] API response times < 200ms for audit queries
- [ ] SSE connections remain stable for > 1 hour
- [ ] Memory usage remains stable under continuous operation
- [ ] No data loss or corruption occurs

### Integration Requirements ✅
- [ ] Compatible with existing Claude Code hook integration
- [ ] All existing superego-mcp AI evaluation functionality preserved
- [ ] Frontend components render correctly with new data format
- [ ] SSE events match expected frontend format

## Next Steps

Upon successful completion of Phase 1:

1. **Performance Optimization**: Profile and optimize any bottlenecks found during testing
2. **Documentation**: Update API documentation and deployment guides
3. **Phase 2 Preparation**: Begin implementing rule management endpoints
4. **Feedback Collection**: Gather user feedback on observe-only mode effectiveness
5. **Rule Analysis**: Analyze decision patterns to prepare rule recommendations for Phase 2

Phase 1 provides the foundation for all subsequent phases while delivering immediate value through comprehensive observation and monitoring capabilities.