# Phase 3: Human Escalation Implementation

## Overview

Phase 3 introduces manual review capabilities, enabling rules to escalate tool calls to human reviewers. This phase implements the core human-in-the-loop functionality that was central to the original cco-mcp system, integrated with the unified rule evaluation model from Phase 2.

## Goals

- ✅ Enable rules to escalate decisions to human reviewers
- ✅ Implement pending review queue and state management
- ✅ Add manual approve/deny capabilities with audit trails
- ✅ Support configurable timeouts with fallback actions
- ✅ Maintain real-time updates for pending reviews
- ✅ Provide comprehensive decision tracking and history

## Architecture Changes

### Backend Extensions (superego-mcp)

#### 1. Enhanced Audit Entry State Management

```python
# File: src/superego_mcp/domain/models.py

from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

class AuditEntryState(Enum):
    """Enhanced states for audit entries"""
    COMPLETED = "completed"      # AI decision made (auto approve/deny)
    PENDING = "pending"          # Awaiting human review
    APPROVED = "approved"        # Human approved
    DENIED = "denied"           # Human denied
    TIMEOUT = "timeout"         # Timed out without human decision

class TimeoutAction(Enum):
    """Actions to take on timeout"""
    ALWAYS_ALLOW = "always_allow"
    ALWAYS_DENY = "always_deny"
    EXTEND_TIMEOUT = "extend_timeout"

@dataclass
class PendingReviewMetadata:
    """Metadata for pending reviews"""
    escalated_at: datetime
    timeout_at: datetime
    timeout_action: TimeoutAction
    priority: str = "normal"  # "low", "normal", "high", "critical"
    review_reason: str = ""
    required_approvers: int = 1
    current_approvers: int = 0
    reviewer_notes: Dict[str, str] = field(default_factory=dict)

@dataclass
class DecisionMetadata:
    """Metadata for human decisions"""
    decided_at: datetime
    decided_by: str
    decision_reason: str
    confidence: float = 1.0  # Human decisions default to high confidence
    additional_notes: Optional[str] = None
    decision_time_seconds: int = 0  # Time taken to make decision

# Enhanced audit entry with full state management
@dataclass
class EnhancedAuditEntry:
    """Enhanced audit entry with human review capabilities"""
    # ... existing fields from Phase 1 ...
    
    # Enhanced state management
    state: AuditEntryState = AuditEntryState.COMPLETED
    
    # Pending review metadata (only for PENDING state)
    pending_metadata: Optional[PendingReviewMetadata] = None
    
    # Decision metadata (for APPROVED/DENIED states)  
    decision_metadata: Optional[DecisionMetadata] = None
    
    # State transition history
    state_history: List[Dict[str, Any]] = field(default_factory=list)

    def transition_to_pending(
        self, 
        timeout_seconds: int, 
        timeout_action: TimeoutAction,
        reason: str,
        priority: str = "normal"
    ) -> None:
        """Transition entry to pending review state"""
        old_state = self.state
        self.state = AuditEntryState.PENDING
        
        self.pending_metadata = PendingReviewMetadata(
            escalated_at=datetime.now(),
            timeout_at=datetime.now() + timedelta(seconds=timeout_seconds),
            timeout_action=timeout_action,
            priority=priority,
            review_reason=reason
        )
        
        self._record_state_transition(old_state, AuditEntryState.PENDING, {
            "timeout_seconds": timeout_seconds,
            "timeout_action": timeout_action.value,
            "reason": reason
        })

    def transition_to_approved(
        self,
        decided_by: str,
        reason: str,
        decision_time_seconds: int = 0,
        notes: Optional[str] = None
    ) -> None:
        """Transition entry to approved state"""
        old_state = self.state
        self.state = AuditEntryState.APPROVED
        
        self.decision_metadata = DecisionMetadata(
            decided_at=datetime.now(),
            decided_by=decided_by,
            decision_reason=reason,
            decision_time_seconds=decision_time_seconds,
            additional_notes=notes
        )
        
        self._record_state_transition(old_state, AuditEntryState.APPROVED, {
            "decided_by": decided_by,
            "reason": reason,
            "decision_time_seconds": decision_time_seconds
        })

    def transition_to_denied(
        self,
        decided_by: str,
        reason: str,
        decision_time_seconds: int = 0,
        notes: Optional[str] = None
    ) -> None:
        """Transition entry to denied state"""
        old_state = self.state
        self.state = AuditEntryState.DENIED
        
        self.decision_metadata = DecisionMetadata(
            decided_at=datetime.now(),
            decided_by=decided_by,
            decision_reason=reason,
            decision_time_seconds=decision_time_seconds,
            additional_notes=notes
        )
        
        self._record_state_transition(old_state, AuditEntryState.DENIED, {
            "decided_by": decided_by,
            "reason": reason,
            "decision_time_seconds": decision_time_seconds
        })

    def transition_to_timeout(self) -> None:
        """Transition entry to timeout state"""
        old_state = self.state
        self.state = AuditEntryState.TIMEOUT
        
        self._record_state_transition(old_state, AuditEntryState.TIMEOUT, {
            "timeout_action": self.pending_metadata.timeout_action.value if self.pending_metadata else None,
            "timeout_at": datetime.now().isoformat()
        })

    def _record_state_transition(
        self, 
        from_state: AuditEntryState, 
        to_state: AuditEntryState, 
        metadata: Dict[str, Any]
    ) -> None:
        """Record state transition in history"""
        self.state_history.append({
            "timestamp": datetime.now().isoformat(),
            "from_state": from_state.value,
            "to_state": to_state.value,
            "metadata": metadata
        })

    def is_pending(self) -> bool:
        """Check if entry is pending human review"""
        return self.state == AuditEntryState.PENDING

    def is_expired(self) -> bool:
        """Check if pending entry has expired"""
        if not self.is_pending() or not self.pending_metadata:
            return False
        return datetime.now() > self.pending_metadata.timeout_at

    def time_until_timeout(self) -> Optional[int]:
        """Get seconds until timeout, or None if not pending"""
        if not self.is_pending() or not self.pending_metadata:
            return None
        
        delta = self.pending_metadata.timeout_at - datetime.now()
        return max(0, int(delta.total_seconds()))

    def to_cco_format(self) -> Dict[str, Any]:
        """Convert to CCO-MCP frontend expected format"""
        base_format = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "agent_identity": self.agent_identity,
            "state": self.state.value.upper(),
            "expires_at": self.expires_at.isoformat(),
            # Add decision details
            "decision_action": self.decision_action,
            "decision_reason": self.decision_reason,
            "decision_confidence": self.decision_confidence,
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "processing_time_ms": self.processing_time_ms
        }

        # Add state-specific fields
        if self.state == AuditEntryState.PENDING and self.pending_metadata:
            base_format.update({
                "escalated_at": self.pending_metadata.escalated_at.isoformat(),
                "timeout_at": self.pending_metadata.timeout_at.isoformat(),
                "timeout_action": self.pending_metadata.timeout_action.value,
                "priority": self.pending_metadata.priority,
                "review_reason": self.pending_metadata.review_reason,
                "time_until_timeout": self.time_until_timeout()
            })

        elif self.state in [AuditEntryState.APPROVED, AuditEntryState.DENIED] and self.decision_metadata:
            base_format.update({
                "decision_by": self.decision_metadata.decided_by,
                "decision_time": self.decision_metadata.decided_at.isoformat(),
                "human_decision_reason": self.decision_metadata.decision_reason,
                "decision_time_seconds": self.decision_metadata.decision_time_seconds,
                "decision_notes": self.decision_metadata.additional_notes
            })

        return base_format
```

#### 2. Pending Review Management

```python
# File: src/superego_mcp/infrastructure/pending_review_manager.py

import asyncio
from typing import Dict, List, Optional, Set
from datetime import datetime, timedelta
from ..domain.models import EnhancedAuditEntry, AuditEntryState, TimeoutAction
import structlog

logger = structlog.get_logger(__name__)

class PendingReviewManager:
    """Manages pending human reviews and timeouts"""
    
    def __init__(self, audit_storage, event_streamer):
        self.audit_storage = audit_storage
        self.event_streamer = event_streamer
        self._timeout_task: Optional[asyncio.Task] = None
        self._shutdown = False
        
    async def start(self) -> None:
        """Start the timeout monitoring task"""
        if self._timeout_task is None or self._timeout_task.done():
            self._timeout_task = asyncio.create_task(self._timeout_monitor())
            logger.info("Pending review manager started")
    
    async def stop(self) -> None:
        """Stop the timeout monitoring task"""
        self._shutdown = True
        if self._timeout_task and not self._timeout_task.done():
            self._timeout_task.cancel()
            try:
                await self._timeout_task
            except asyncio.CancelledError:
                pass
        logger.info("Pending review manager stopped")
    
    async def get_pending_reviews(
        self, 
        priority: Optional[str] = None,
        limit: int = 100
    ) -> List[EnhancedAuditEntry]:
        """Get all pending review entries"""
        # Query audit storage for pending entries
        result = await self.audit_storage.query_entries(
            state="pending",
            limit=limit
        )
        
        entries = []
        for entry_data in result.get("entries", []):
            entry = await self.audit_storage.get_entry(entry_data["id"])
            if entry and entry.is_pending():
                if priority is None or (entry.pending_metadata and entry.pending_metadata.priority == priority):
                    entries.append(entry)
        
        # Sort by priority and escalation time
        priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
        entries.sort(key=lambda e: (
            priority_order.get(e.pending_metadata.priority if e.pending_metadata else "normal", 2),
            e.pending_metadata.escalated_at if e.pending_metadata else datetime.min
        ))
        
        return entries
    
    async def approve_entry(
        self,
        entry_id: str,
        decided_by: str,
        reason: str,
        notes: Optional[str] = None
    ) -> bool:
        """Approve a pending review entry"""
        entry = await self.audit_storage.get_entry(entry_id)
        if not entry or not entry.is_pending():
            return False
        
        # Calculate decision time
        decision_time_seconds = 0
        if entry.pending_metadata:
            delta = datetime.now() - entry.pending_metadata.escalated_at
            decision_time_seconds = int(delta.total_seconds())
        
        # Transition to approved state
        entry.transition_to_approved(
            decided_by=decided_by,
            reason=reason,
            decision_time_seconds=decision_time_seconds,
            notes=notes
        )
        
        # Update in storage
        await self.audit_storage.update_entry(entry)
        
        # Broadcast state change event
        await self.event_streamer.broadcast_state_change(entry)
        
        logger.info(
            "Entry approved by human reviewer",
            entry_id=entry_id,
            decided_by=decided_by,
            decision_time_seconds=decision_time_seconds
        )
        
        return True
    
    async def deny_entry(
        self,
        entry_id: str,
        decided_by: str,
        reason: str,
        notes: Optional[str] = None
    ) -> bool:
        """Deny a pending review entry"""
        entry = await self.audit_storage.get_entry(entry_id)
        if not entry or not entry.is_pending():
            return False
        
        # Calculate decision time
        decision_time_seconds = 0
        if entry.pending_metadata:
            delta = datetime.now() - entry.pending_metadata.escalated_at
            decision_time_seconds = int(delta.total_seconds())
        
        # Transition to denied state
        entry.transition_to_denied(
            decided_by=decided_by,
            reason=reason,
            decision_time_seconds=decision_time_seconds,
            notes=notes
        )
        
        # Update in storage
        await self.audit_storage.update_entry(entry)
        
        # Broadcast state change event
        await self.event_streamer.broadcast_state_change(entry)
        
        logger.info(
            "Entry denied by human reviewer",
            entry_id=entry_id,
            decided_by=decided_by,
            decision_time_seconds=decision_time_seconds
        )
        
        return True
    
    async def _timeout_monitor(self) -> None:
        """Background task to monitor and process timeouts"""
        logger.info("Timeout monitor started")
        
        while not self._shutdown:
            try:
                # Get all pending entries
                pending_entries = await self.get_pending_reviews(limit=1000)
                
                timeout_count = 0
                for entry in pending_entries:
                    if entry.is_expired():
                        await self._process_timeout(entry)
                        timeout_count += 1
                
                if timeout_count > 0:
                    logger.info(f"Processed {timeout_count} timeout entries")
                
                # Sleep for monitoring interval (30 seconds)
                await asyncio.sleep(30)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in timeout monitor", error=str(e))
                await asyncio.sleep(5)  # Short delay on error
        
        logger.info("Timeout monitor stopped")
    
    async def _process_timeout(self, entry: EnhancedAuditEntry) -> None:
        """Process a timed-out entry"""
        if not entry.pending_metadata:
            return
        
        timeout_action = entry.pending_metadata.timeout_action
        
        logger.info(
            "Processing timeout entry",
            entry_id=entry.id,
            timeout_action=timeout_action.value,
            escalated_at=entry.pending_metadata.escalated_at.isoformat()
        )
        
        if timeout_action == TimeoutAction.AUTO_APPROVE:
            # Auto-approve on timeout
            entry.transition_to_approved(
                decided_by="system_timeout",
                reason="Auto-approved due to timeout",
                decision_time_seconds=int((datetime.now() - entry.pending_metadata.escalated_at).total_seconds())
            )
            
        elif timeout_action == TimeoutAction.AUTO_DENY:
            # Auto-deny on timeout
            entry.transition_to_denied(
                decided_by="system_timeout",
                reason="Auto-denied due to timeout",
                decision_time_seconds=int((datetime.now() - entry.pending_metadata.escalated_at).total_seconds())
            )
        
        elif timeout_action == TimeoutAction.EXTEND_TIMEOUT:
            # Extend timeout by another period
            entry.pending_metadata.timeout_at = datetime.now() + timedelta(seconds=300)  # Extend 5 minutes
            logger.info(f"Extended timeout for entry {entry.id}")
            
        else:
            # Mark as timed out
            entry.transition_to_timeout()
        
        # Update in storage
        await self.audit_storage.update_entry(entry)
        
        # Broadcast timeout event
        await self.event_streamer.broadcast_timeout(entry, timeout_action)
```

#### 3. Human Review Rule Evaluator

```python
# File: src/superego_mcp/domain/rule_evaluators.py

from typing import Dict, Any, Optional
from ..domain.models import ToolRequest, EnhancedAuditEntry, TimeoutAction
from ..domain.unified_rules import RuleAction, RuleEvaluationResult

class HumanReviewRuleEvaluator(RuleEvaluator):
    """Human review evaluator for manual oversight"""
    
    def __init__(self, pending_review_manager):
        self.pending_review_manager = pending_review_manager
    
    async def evaluate(
        self, 
        request: ToolRequest, 
        rule_config: Dict[str, Any]
    ) -> RuleEvaluationResult:
        """Evaluate if request requires human review"""
        
        # Check if request matches this rule's patterns
        tool_patterns = rule_config.get("tool_patterns", [])
        if not self._matches_patterns(request, tool_patterns):
            return RuleEvaluationResult(
                action=None,
                confidence=0.0,
                reason="No pattern match",
                evaluator_type="escalate_to_human"
            )
        
        # Check additional conditions if specified
        conditions = rule_config.get("conditions", {})
        if conditions and not self._matches_conditions(request, conditions):
            return RuleEvaluationResult(
                action=None,
                confidence=0.0,
                reason="Conditions not met",
                evaluator_type="escalate_to_human"
            )
        
        # Extract configuration
        timeout_seconds = rule_config.get("timeout_seconds", 300)  # 5 minute default
        timeout_action = TimeoutAction(rule_config.get("timeout_action", "always_deny"))
        priority = rule_config.get("priority", "normal")
        review_reason = rule_config.get("review_reason", "Requires human review per security policy")
        
        return RuleEvaluationResult(
            action=RuleAction.HUMAN_REVIEW,
            confidence=1.0,
            reason=review_reason,
            evaluator_type="escalate_to_human",
            review_metadata={
                "timeout_seconds": timeout_seconds,
                "timeout_action": timeout_action.value,
                "priority": priority,
                "review_reason": review_reason
            }
        )
    
    def _matches_patterns(self, request: ToolRequest, patterns: List[Dict[str, Any]]) -> bool:
        """Check if request matches tool patterns"""
        for pattern in patterns:
            tool_name = pattern.get("name", "")
            tool_type = pattern.get("type", "builtin")
            
            if request.tool_name == tool_name:
                # Check parameter conditions if specified
                param_conditions = pattern.get("parameter_conditions", {})
                if param_conditions:
                    if not self._matches_parameter_conditions(request, param_conditions):
                        continue
                
                return True
        
        return False
    
    def _matches_parameter_conditions(
        self, 
        request: ToolRequest, 
        conditions: Dict[str, Any]
    ) -> bool:
        """Check if request parameters match conditions"""
        for param_name, condition in conditions.items():
            param_value = request.parameters.get(param_name)
            
            if param_value is None:
                continue
            
            # Support different condition types
            if isinstance(condition, dict):
                if "contains" in condition:
                    # Check if parameter contains any of the specified strings
                    contains_values = condition["contains"]
                    if isinstance(contains_values, list):
                        if not any(val in str(param_value) for val in contains_values):
                            return False
                    else:
                        if contains_values not in str(param_value):
                            return False
                
                elif "equals" in condition:
                    if param_value != condition["equals"]:
                        return False
                
                elif "regex" in condition:
                    import re
                    if not re.search(condition["regex"], str(param_value)):
                        return False
            
            else:
                # Simple equality check
                if param_value != condition:
                    return False
        
        return True
    
    def _matches_conditions(self, request: ToolRequest, conditions: Dict[str, Any]) -> bool:
        """Check additional conditions beyond pattern matching"""
        # Check session ID patterns
        if "session_patterns" in conditions:
            session_patterns = conditions["session_patterns"]
            if not any(pattern in request.session_id for pattern in session_patterns):
                return False
        
        # Check agent ID patterns
        if "agent_patterns" in conditions:
            agent_patterns = conditions["agent_patterns"]
            if not any(pattern in request.agent_id for pattern in agent_patterns):
                return False
        
        # Check working directory patterns
        if "cwd_patterns" in conditions:
            cwd_patterns = conditions["cwd_patterns"]
            if request.cwd and not any(pattern in request.cwd for pattern in cwd_patterns):
                return False
        
        return True

    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate human review evaluator configuration"""
        required_fields = ["tool_patterns"]
        
        for field in required_fields:
            if field not in config:
                return False
        
        # Validate timeout settings
        timeout_seconds = config.get("timeout_seconds", 300)
        if not isinstance(timeout_seconds, int) or timeout_seconds <= 0:
            return False
        
        timeout_action = config.get("timeout_action", "always_deny")
        if timeout_action not in ["always_allow", "always_deny", "extend_timeout"]:
            return False
        
        priority = config.get("priority", "normal")
        if priority not in ["low", "normal", "high", "critical"]:
            return False
        
        return True
```

#### 4. Enhanced API Endpoints

```python
# File: src/superego_mcp/presentation/unified_server.py

# Add these endpoints for Phase 3:

@self.fastapi.get("/v1/audit/pending")
async def get_pending_reviews(
    priority: Optional[str] = None,
    limit: int = 100
) -> Dict[str, Any]:
    """Get all pending review entries"""
    try:
        pending_entries = await self.pending_review_manager.get_pending_reviews(
            priority=priority,
            limit=limit
        )
        
        return {
            "entries": [entry.to_cco_format() for entry in pending_entries],
            "total": len(pending_entries),
            "by_priority": {
                "critical": len([e for e in pending_entries if e.pending_metadata and e.pending_metadata.priority == "critical"]),
                "high": len([e for e in pending_entries if e.pending_metadata and e.pending_metadata.priority == "high"]),
                "normal": len([e for e in pending_entries if e.pending_metadata and e.pending_metadata.priority == "normal"]),
                "low": len([e for e in pending_entries if e.pending_metadata and e.pending_metadata.priority == "low"])
            }
        }
    except Exception as e:
        logger.error("Failed to get pending reviews", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/audit/{entry_id}/approve")
async def approve_entry(entry_id: str, request: Request) -> Dict[str, Any]:
    """Approve a pending review entry"""
    try:
        data = await request.json()
        
        decided_by = self._extract_user_from_request(request)
        reason = data.get("reason", "Approved by human reviewer")
        notes = data.get("notes")
        
        success = await self.pending_review_manager.approve_entry(
            entry_id=entry_id,
            decided_by=decided_by,
            reason=reason,
            notes=notes
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Entry not found or not pending")
        
        # Get updated entry
        entry = await self.audit_storage.get_entry(entry_id)
        
        return {
            "success": True,
            "entry": entry.to_cco_format() if entry else None,
            "message": "Entry approved successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to approve entry", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/audit/{entry_id}/deny")
async def deny_entry(entry_id: str, request: Request) -> Dict[str, Any]:
    """Deny a pending review entry"""
    try:
        data = await request.json()
        
        decided_by = self._extract_user_from_request(request)
        reason = data.get("reason", "Denied by human reviewer")
        notes = data.get("notes")
        
        success = await self.pending_review_manager.deny_entry(
            entry_id=entry_id,
            decided_by=decided_by,
            reason=reason,
            notes=notes
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Entry not found or not pending")
        
        # Get updated entry
        entry = await self.audit_storage.get_entry(entry_id)
        
        return {
            "success": True,
            "entry": entry.to_cco_format() if entry else None,
            "message": "Entry denied successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to deny entry", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.get("/v1/audit/stats")
async def get_audit_statistics() -> Dict[str, Any]:
    """Get comprehensive audit statistics"""
    try:
        # Get recent entries for statistics
        all_entries_result = await self.audit_storage.query_entries(limit=1000)
        
        total_entries = all_entries_result.get("total", 0)
        entries_data = all_entries_result.get("entries", [])
        
        if total_entries == 0:
            return {
                "total_entries": 0,
                "by_state": {"completed": 0, "pending": 0, "approved": 0, "denied": 0, "timeout": 0},
                "by_action": {"allow": 0, "deny": 0},
                "pending_stats": {"total": 0, "by_priority": {"low": 0, "normal": 0, "high": 0, "critical": 0}},
                "timing_stats": {"avg_decision_time_seconds": 0, "avg_processing_time_ms": 0}
            }
        
        # Calculate statistics
        by_state = {"completed": 0, "pending": 0, "approved": 0, "denied": 0, "timeout": 0}
        by_action = {"allow": 0, "deny": 0}
        decision_times = []
        processing_times = []
        
        for entry_data in entries_data:
            state = entry_data.get("state", "completed").lower()
            by_state[state] = by_state.get(state, 0) + 1
            
            action = entry_data.get("decision_action", "deny")
            if action == "allow":
                by_action["allow"] += 1
            else:
                by_action["deny"] += 1
            
            # Collect timing data
            if "decision_time_seconds" in entry_data:
                decision_times.append(entry_data["decision_time_seconds"])
            
            if "processing_time_ms" in entry_data:
                processing_times.append(entry_data["processing_time_ms"])
        
        # Get pending review statistics
        pending_entries = await self.pending_review_manager.get_pending_reviews(limit=1000)
        pending_by_priority = {"low": 0, "normal": 0, "high": 0, "critical": 0}
        
        for entry in pending_entries:
            if entry.pending_metadata:
                priority = entry.pending_metadata.priority
                pending_by_priority[priority] = pending_by_priority.get(priority, 0) + 1
        
        return {
            "total_entries": total_entries,
            "by_state": by_state,
            "by_action": by_action,
            "pending_stats": {
                "total": len(pending_entries),
                "by_priority": pending_by_priority
            },
            "timing_stats": {
                "avg_decision_time_seconds": sum(decision_times) / len(decision_times) if decision_times else 0,
                "avg_processing_time_ms": sum(processing_times) / len(processing_times) if processing_times else 0
            }
        }
        
    except Exception as e:
        logger.error("Failed to get audit statistics", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

### Frontend Extensions (cco-mcp)

#### 1. Enhanced Audit Log Components

```typescript
// File: ui/src/components/audit/PendingReviewEntry.tsx

import React, { useState } from 'react';
import { AuditLogEntry, PendingReviewMetadata } from '../../types/audit';

interface PendingReviewEntryProps {
  entry: AuditLogEntry & { pending_metadata?: PendingReviewMetadata };
  onApprove: (id: string, reason: string, notes?: string) => Promise<void>;
  onDeny: (id: string, reason: string, notes?: string) => Promise<void>;
}

export function PendingReviewEntry({ entry, onApprove, onDeny }: PendingReviewEntryProps) {
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionType, setDecisionType] = useState<'approve' | 'deny' | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDecision = async (type: 'approve' | 'deny') => {
    setDecisionType(type);
    setShowDecisionForm(true);
  };

  const submitDecision = async () => {
    if (!reason.trim() || !decisionType) return;
    
    setSubmitting(true);
    try {
      if (decisionType === 'approve') {
        await onApprove(entry.id, reason, notes || undefined);
      } else {
        await onDeny(entry.id, reason, notes || undefined);
      }
      setShowDecisionForm(false);
      setReason('');
      setNotes('');
    } catch (error) {
      console.error('Failed to submit decision:', error);
      // Error handling can be improved with toast notifications
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeUntilTimeout = (seconds: number): string => {
    if (seconds <= 0) return 'Expired';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'normal': return 'text-blue-600';
      case 'low': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="pending-review-entry border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{entry.tool_name}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(entry.priority || 'normal')}`}>
              {(entry.priority || 'normal').toUpperCase()}
            </span>
            <span className="px-2 py-1 text-xs bg-yellow-200 text-yellow-800 rounded-full">
              PENDING REVIEW
            </span>
          </div>
          
          <div className="text-sm text-gray-600 mb-2">
            <p><strong>Agent:</strong> {entry.agent_identity || 'Unknown'}</p>
            <p><strong>Session:</strong> {entry.session_id}</p>
            <p><strong>Escalated:</strong> {new Date(entry.escalated_at!).toLocaleString()}</p>
            <p><strong>Review Reason:</strong> {entry.review_reason}</p>
          </div>
          
          <div className="text-sm mb-2">
            <strong>Parameters:</strong>
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(entry.tool_input, null, 2)}
            </pre>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <span className="text-red-600 font-medium">
              ⏱️ Timeout: {formatTimeUntilTimeout(entry.time_until_timeout || 0)}
            </span>
            <span className="text-gray-600">
              Timeout Action: {entry.timeout_action?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          <button
            onClick={() => handleDecision('approve')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            disabled={submitting}
          >
            Approve
          </button>
          <button
            onClick={() => handleDecision('deny')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            disabled={submitting}
          >
            Deny
          </button>
        </div>
      </div>

      {showDecisionForm && (
        <div className="mt-4 p-4 bg-white rounded border">
          <h4 className="font-medium mb-2">
            {decisionType === 'approve' ? 'Approve' : 'Deny'} Request
          </h4>
          
          <div className="space-y-3">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                Reason *
              </label>
              <input
                id="reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Why are you ${decisionType === 'approve' ? 'approving' : 'denying'} this request?`}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Additional Notes (optional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional context or notes..."
                rows={3}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={submitDecision}
                disabled={!reason.trim() || submitting}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                  decisionType === 'approve' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submitting ? 'Submitting...' : `Confirm ${decisionType === 'approve' ? 'Approval' : 'Denial'}`}
              </button>
              <button
                onClick={() => setShowDecisionForm(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### 2. Pending Reviews Dashboard

```typescript
// File: ui/src/components/audit/PendingReviewsDashboard.tsx

import React, { useEffect, useState } from 'react';
import { usePendingReviews } from '../../hooks/usePendingReviews';
import { PendingReviewEntry } from './PendingReviewEntry';
import { AuditLogEntry } from '../../types/audit';

interface PendingReviewsStats {
  total: number;
  by_priority: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
}

export function PendingReviewsDashboard() {
  const {
    pendingReviews,
    loading,
    error,
    refetch,
    approve,
    deny
  } = usePendingReviews();

  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  const handleApprove = async (id: string, reason: string, notes?: string) => {
    try {
      await approve(id, reason, notes);
      // Refresh the list after successful approval
      await refetch();
    } catch (error) {
      console.error('Failed to approve entry:', error);
      // Could show toast notification here
    }
  };

  const handleDeny = async (id: string, reason: string, notes?: string) => {
    try {
      await deny(id, reason, notes);
      // Refresh the list after successful denial
      await refetch();
    } catch (error) {
      console.error('Failed to deny entry:', error);
      // Could show toast notification here
    }
  };

  const filteredReviews = selectedPriority === 'all' 
    ? pendingReviews 
    : pendingReviews.filter(review => review.priority === selectedPriority);

  const getPriorityCount = (priority: string): number => {
    return pendingReviews.filter(review => review.priority === priority).length;
  };

  if (loading) {
    return <div className="loading">Loading pending reviews...</div>;
  }

  if (error) {
    return <div className="error">Error loading pending reviews: {error}</div>;
  }

  return (
    <div className="pending-reviews-dashboard">
      <div className="dashboard-header flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Reviews</h1>
          <p className="text-gray-600">
            {pendingReviews.length} requests awaiting human review
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            Auto-refresh
          </label>
          
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="priority-filters mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedPriority('all')}
            className={`px-4 py-2 rounded ${
              selectedPriority === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All ({pendingReviews.length})
          </button>
          
          <button
            onClick={() => setSelectedPriority('critical')}
            className={`px-4 py-2 rounded ${
              selectedPriority === 'critical' 
                ? 'bg-red-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Critical ({getPriorityCount('critical')})
          </button>
          
          <button
            onClick={() => setSelectedPriority('high')}
            className={`px-4 py-2 rounded ${
              selectedPriority === 'high' 
                ? 'bg-orange-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            High ({getPriorityCount('high')})
          </button>
          
          <button
            onClick={() => setSelectedPriority('normal')}
            className={`px-4 py-2 rounded ${
              selectedPriority === 'normal' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Normal ({getPriorityCount('normal')})
          </button>
          
          <button
            onClick={() => setSelectedPriority('low')}
            className={`px-4 py-2 rounded ${
              selectedPriority === 'low' 
                ? 'bg-gray-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Low ({getPriorityCount('low')})
          </button>
        </div>
      </div>

      <div className="reviews-list space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-medium mb-2">No pending reviews!</h3>
            <p>All requests have been processed or no reviews are required.</p>
          </div>
        ) : (
          filteredReviews.map((review) => (
            <PendingReviewEntry
              key={review.id}
              entry={review}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

#### 3. Pending Reviews Hook

```typescript
// File: ui/src/hooks/usePendingReviews.ts

import { useState, useCallback, useEffect } from 'react';
import { AuditLogEntry } from '../types/audit';
import { API_CONFIG } from '../config/api';

interface PendingReviewsResponse {
  entries: AuditLogEntry[];
  total: number;
  by_priority: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
}

export function usePendingReviews() {
  const [pendingReviews, setPendingReviews] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingReviews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/v1/audit/pending`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: PendingReviewsResponse = await response.json();
      setPendingReviews(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (id: string, reason: string, notes?: string) => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/audit/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason,
        notes
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to approve entry');
    }

    return result;
  }, []);

  const deny = useCallback(async (id: string, reason: string, notes?: string) => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/audit/${id}/deny`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason,
        notes
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to deny entry');
    }

    return result;
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchPendingReviews();
  }, [fetchPendingReviews]);

  return {
    pendingReviews,
    loading,
    error,
    refetch: fetchPendingReviews,
    approve,
    deny,
  };
}
```

## Testing Strategy

### Backend Testing

#### 1. State Transition Tests
```python
# File: tests/test_audit_state_management.py

@pytest.mark.asyncio
async def test_pending_review_workflow():
    # Create entry
    entry = EnhancedAuditEntry(
        id="test-pending",
        timestamp=datetime.now(),
        tool_name="Bash",
        tool_input={"command": "rm -rf /"},
        agent_identity="test_agent",
        session_id="test_session",
        cwd="/tmp",
        decision_action="ask",  # Will escalate
        decision_reason="High-risk command requires review",
        decision_confidence=0.5,
        processing_time_ms=100
    )
    
    # Transition to pending
    entry.transition_to_pending(
        timeout_seconds=300,
        timeout_action=TimeoutAction.AUTO_DENY,
        reason="High-risk command detected",
        priority="high"
    )
    
    assert entry.state == AuditEntryState.PENDING
    assert entry.pending_metadata is not None
    assert entry.pending_metadata.priority == "high"
    assert not entry.is_expired()  # Should not be expired immediately
    
    # Approve the entry
    entry.transition_to_approved(
        decided_by="test_reviewer",
        reason="Reviewed and deemed safe",
        decision_time_seconds=120
    )
    
    assert entry.state == AuditEntryState.APPROVED
    assert entry.decision_metadata is not None
    assert entry.decision_metadata.decided_by == "test_reviewer"
    assert len(entry.state_history) == 2  # pending -> approved
```

#### 2. Timeout Processing Tests
```python
# File: tests/test_timeout_processing.py

@pytest.mark.asyncio
async def test_timeout_always_deny():
    storage = MockAuditStorage()
    manager = PendingReviewManager(storage, MockEventStreamer())
    
    # Create expired entry
    entry = EnhancedAuditEntry(
        id="expired-entry",
        timestamp=datetime.now() - timedelta(minutes=10),
        # ... other required fields
    )
    
    entry.transition_to_pending(
        timeout_seconds=60,  # 1 minute timeout
        timeout_action=TimeoutAction.AUTO_DENY,
        reason="Test timeout"
    )
    
    # Manually set as expired
    entry.pending_metadata.timeout_at = datetime.now() - timedelta(seconds=30)
    
    await storage.add_entry(entry)
    
    # Process timeout
    await manager._process_timeout(entry)
    
    # Check state transitioned to denied
    assert entry.state == AuditEntryState.DENIED
    assert entry.decision_metadata.decided_by == "system_timeout"
```

### Frontend Testing

#### 1. Pending Review Component Tests
```typescript
// File: ui/src/components/audit/__tests__/PendingReviewEntry.test.tsx

describe('PendingReviewEntry', () => {
  const mockEntry = {
    id: 'pending-1',
    tool_name: 'Bash',
    tool_input: { command: 'rm test.txt' },
    state: 'PENDING',
    priority: 'high',
    time_until_timeout: 180,
    review_reason: 'High-risk command',
    escalated_at: '2024-01-01T12:00:00Z',
    timeout_action: 'always_deny'
  };

  it('renders pending review with correct priority', () => {
    render(
      <PendingReviewEntry
        entry={mockEntry}
        onApprove={jest.fn()}
        onDeny={jest.fn()}
      />
    );
    
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('PENDING REVIEW')).toBeInTheDocument();
    expect(screen.getByText('High-risk command')).toBeInTheDocument();
  });

  it('shows decision form when approve is clicked', async () => {
    const onApprove = jest.fn();
    
    render(
      <PendingReviewEntry
        entry={mockEntry}
        onApprove={onApprove}
        onDeny={jest.fn()}
      />
    );
    
    fireEvent.click(screen.getByText('Approve'));
    
    expect(screen.getByText('Approve Request')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Why are you approving/)).toBeInTheDocument();
  });

  it('submits approval with reason', async () => {
    const onApprove = jest.fn().mockResolvedValue({});
    
    render(
      <PendingReviewEntry
        entry={mockEntry}
        onApprove={onApprove}
        onDeny={jest.fn()}
      />
    );
    
    // Click approve
    fireEvent.click(screen.getByText('Approve'));
    
    // Fill reason
    fireEvent.change(screen.getByPlaceholderText(/Why are you approving/), {
      target: { value: 'Safe after review' }
    });
    
    // Submit
    fireEvent.click(screen.getByText('Confirm Approval'));
    
    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith('pending-1', 'Safe after review', undefined);
    });
  });
});
```

## Success Criteria

### Functional Requirements ✅
- [ ] Rules can escalate requests to human review
- [ ] Pending reviews are queued and displayed properly
- [ ] Manual approve/deny operations work correctly
- [ ] Timeout handling processes entries automatically
- [ ] State transitions are tracked in audit history
- [ ] Real-time updates notify of state changes

### Performance Requirements ✅
- [ ] Pending review queue loads within 2 seconds
- [ ] Approve/deny operations complete within 3 seconds
- [ ] Timeout processing runs reliably every 30 seconds
- [ ] No memory leaks in long-running review sessions

### Integration Requirements ✅
- [ ] Human review rules integrate with unified rule engine
- [ ] SSE events include pending review notifications
- [ ] All state transitions are properly audited
- [ ] Frontend correctly displays all review states

## Next Steps

Upon successful completion of Phase 3:

1. **Advanced Review Features**: Multi-reviewer approval, review assignments
2. **Review Analytics**: Decision patterns, reviewer performance metrics  
3. **Notification System**: Email/Slack notifications for pending reviews
4. **Phase 4 Preparation**: Begin implementing AI-assisted review features
5. **Performance Optimization**: Optimize timeout processing and state management

Phase 3 completes the core human-in-the-loop functionality, providing comprehensive manual oversight capabilities while maintaining full compatibility with automated AI decision-making from previous phases.