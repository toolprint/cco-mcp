# Superego-MCP Backend Migration Plan

## Executive Summary

This document outlines the comprehensive migration plan for transitioning the cco-mcp frontend to use the superego-mcp backend. The migration will be implemented in four incremental phases, starting with an "observe-only" mode and gradually adding human review capabilities while preserving existing UI components.

**Migration Feasibility**: ✅ **ACHIEVABLE** with significant backend additions
**Estimated Timeline**: 8-12 weeks across four phases
**Risk Level**: Medium - requires substantial backend changes but maintains frontend stability

## Current State Analysis

### CCO-MCP Architecture
- **Purpose**: Manual approval workflow for Claude Code tool calls
- **Key Features**: Human-in-the-loop approvals, real-time SSE updates, rule-based auto-approval
- **Data Flow**: Tool call → Rule evaluation → Manual review (if needed) → Approve/Deny
- **Storage**: In-memory with TTL-based expiration
- **UI**: React dashboard for audit logs and configuration management

### Superego-MCP Architecture  
- **Purpose**: AI-powered security evaluation with policy enforcement
- **Key Features**: Automated AI decision-making, Claude Code hook integration, YAML configuration
- **Data Flow**: Tool call → AI evaluation → Auto approve/deny
- **Storage**: In-memory audit logging, file-based configuration
- **UI**: None (API-only)

### Compatibility Assessment

| Feature | CCO-MCP | Superego-MCP | Migration Required |
|---------|---------|--------------|-------------------|
| Manual Approvals | ✅ Core feature | ❌ Missing | **High** - New workflow |
| Auto Approvals | ✅ Rule-based | ✅ AI-powered | **Medium** - Integration |
| Real-time Updates | ✅ SSE streams | ⚠️ Partial | **Medium** - Wire up existing |
| Configuration UI | ✅ Full CRUD | ❌ Read-only | **High** - New endpoints |
| Audit History | ✅ Queryable | ⚠️ Basic | **Medium** - Enhanced storage |
| Hook Integration | ✅ Via bridge | ✅ Native | **Low** - Compatible |

## Migration Strategy

### Core Design Principles

1. **Incremental Deployment**: Each phase adds functionality without breaking previous features
2. **UI Preservation**: Keep existing cco-mcp frontend components and design
3. **Unified Rule Model**: Abstract evaluation interface supporting multiple strategies
4. **Fresh Start**: No data migration needed, start with clean configuration
5. **Backward Compatibility**: Not required as no production deployments exist

### Phased Implementation

#### **Phase 1: Observe-Only Mode** (3 weeks)
**Goal**: Deploy cco-mcp frontend in read-only mode with superego-mcp backend

**Capabilities**:
- ✅ View audit history of AI-made decisions
- ✅ Real-time monitoring via SSE
- ✅ Filter and search audit entries
- ❌ No manual approve/deny (UI buttons disabled)
- ❌ No configuration changes

**Benefits**:
- Validates integration architecture
- Allows observation of decision patterns
- Identifies rule refinement needs
- Low risk deployment

#### **Phase 2: Rule Management** (2-3 weeks)
**Goal**: Enable configuration management through the UI

**Capabilities**:
- ✅ CRUD operations for rules via UI
- ✅ Rule validation and testing
- ✅ Hot-reload configuration changes
- ✅ Mixed pattern + AI rule support
- ❌ Still no manual approvals

**Benefits**:
- Full configuration control
- Rapid rule iteration
- Supports both simple and AI-powered rules

#### **Phase 3: Human Escalation** (3-4 weeks)
**Goal**: Add manual review capabilities with timeout handling

**Capabilities**:
- ✅ "Human review" action type
- ✅ Pending review queue
- ✅ Manual approve/deny with reasons
- ✅ Configurable timeouts
- ✅ Decision tracking and audit

**Benefits**:
- Complete manual oversight capability
- Gradual automation through rule refinement
- Full audit trail of human decisions

#### **Phase 4: AI-Assisted Review** (2-3 weeks)
**Goal**: Enhance human decisions with AI insights

**Capabilities**:
- ✅ AI risk analysis for pending reviews
- ✅ Similar past decisions suggestions
- ✅ Rule modification recommendations
- ✅ Decision explanation generation

**Benefits**:
- Faster human decision-making
- Consistent decision patterns
- Automated rule learning

## Technical Implementation

### Unified Rule Evaluation Model

The migration centers around a new unified rule evaluation system that supports multiple strategies:

```python
class RuleAction(Enum):
    AUTO_APPROVE = "auto_approve"
    AUTO_DENY = "auto_deny"
    AI_SAMPLE = "ai_sample"
    HUMAN_REVIEW = "human_review"
    CONDITIONAL = "conditional"

class RuleEvaluator(ABC):
    @abstractmethod
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        pass
```

**Evaluator Types**:
1. **Pattern Evaluator**: Simple matching (CCO-MCP compatibility)
2. **AI Sample Evaluator**: Current superego-mcp logic
3. **Human Review Evaluator**: New manual review capability
4. **Conditional Evaluator**: Complex logic composition

### API Mapping

| CCO-MCP Endpoint | Superego-MCP Equivalent | Implementation Status |
|------------------|-------------------------|---------------------|
| `GET /api/audit-log` | `GET /v1/audit` | **New** - Enhanced querying |
| `POST /api/audit-log/:id/approve` | `POST /v1/audit/:id/approve` | **New** - Manual workflow |
| `POST /api/audit-log/:id/deny` | `POST /v1/audit/:id/deny` | **New** - Manual workflow |
| `GET /api/config` | `GET /v1/config/rules` | **Existing** - Enhanced |
| `PUT /api/config` | `PUT /v1/config/rules` | **New** - CRUD operations |
| `GET /api/audit-log/stream` | `GET /v1/events/stream` | **Enhanced** - Wire up SSE |

### Data Model Evolution

#### Current Superego Decision Model
```python
@dataclass
class Decision:
    action: str  # "allow", "deny", "sample"
    reason: str
    confidence: float
    processing_time_ms: int
    rule_id: Optional[str] = None
```

#### Enhanced Decision Model
```python
@dataclass
class EnhancedDecision:
    action: str  # "allow", "deny", "ask", "sample"
    reason: str
    confidence: float
    processing_time_ms: int
    rule_id: Optional[str] = None
    
    # New fields for human review
    state: str = "completed"  # "completed", "pending", "approved", "denied"
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    timeout_at: Optional[datetime] = None
    requires_approval: bool = False
```

## Implementation Details by Phase

### Phase 1: Observe-Only Mode

**Backend Changes Required**:

1. **Enhanced Audit Storage**
```python
class AuditEntry:
    id: str
    timestamp: datetime
    request: ToolRequest
    decision: EnhancedDecision
    state: str = "completed"
    metadata: Dict[str, Any] = {}
```

2. **New API Endpoints**
```python
@app.get("/v1/audit")
async def query_audit_entries(
    state: Optional[str] = None,
    agent_identity: Optional[str] = None,
    tool_name: Optional[str] = None,
    search: Optional[str] = None,
    offset: int = 0,
    limit: int = 100
) -> AuditQueryResponse
```

3. **SSE Integration**
```python
@app.get("/v1/events/stream")
async def audit_stream(request: Request) -> StreamingResponse:
    # Wire up existing SSEManager to unified_server
    pass
```

**Frontend Changes Required**:
- Update API base URL configuration
- Map new endpoint structures
- Disable approve/deny buttons in UI
- Add "observe-only" mode indicators

**Testing Approach**:
- End-to-end integration tests
- SSE connection stability tests  
- UI component functionality tests
- Performance benchmarks

### Phase 2: Rule Management

**Backend Changes Required**:

1. **Rule CRUD Endpoints**
```python
@app.post("/v1/config/rules")
async def create_rule(rule: UnifiedRule) -> CreateRuleResponse

@app.put("/v1/config/rules/{rule_id}")
async def update_rule(rule_id: str, rule: UnifiedRule) -> UpdateRuleResponse

@app.delete("/v1/config/rules/{rule_id}")
async def delete_rule(rule_id: str) -> DeleteRuleResponse
```

2. **Rule Validation**
```python
@app.post("/v1/config/rules/validate")
async def validate_rule(rule: UnifiedRule) -> ValidationResponse

@app.post("/v1/config/rules/test")
async def test_rule(rule_test: RuleTestRequest) -> RuleTestResponse
```

3. **Hot-reload Implementation**
```python
class UnifiedRuleEngine:
    async def reload_rules(self) -> None:
        # Reload from YAML + API changes
        # Update in-memory rule cache
        # Emit configuration update events
```

### Phase 3: Human Escalation

**Backend Changes Required**:

1. **State Management**
```python
class PendingReviewManager:
    pending_reviews: Dict[str, PendingReview] = {}
    
    async def create_pending_review(self, entry: AuditEntry) -> str
    async def resolve_review(self, entry_id: str, action: str, resolved_by: str) -> bool
    async def handle_timeouts(self) -> List[str]
```

2. **Approval Endpoints**
```python
@app.post("/v1/audit/{entry_id}/approve")
async def approve_entry(entry_id: str, approval: ApprovalRequest) -> ApprovalResponse

@app.post("/v1/audit/{entry_id}/deny") 
async def deny_entry(entry_id: str, denial: DenialRequest) -> DenialResponse
```

3. **Timeout Handling**
```python
class TimeoutManager:
    async def schedule_timeout(self, entry_id: str, timeout_seconds: int) -> None
    async def process_timeouts(self) -> List[TimeoutEvent]
```

### Phase 4: AI-Assisted Review

**Backend Changes Required**:

1. **Risk Analysis**
```python
class ReviewAssistant:
    async def analyze_risk(self, entry: AuditEntry) -> RiskAnalysis
    async def find_similar_decisions(self, entry: AuditEntry) -> List[SimilarDecision]
    async def suggest_rule_modifications(self, patterns: List[DecisionPattern]) -> List[RuleSuggestion]
```

2. **Enhanced Metadata**
```python
@dataclass
class AuditEntryWithAssistance:
    entry: AuditEntry
    risk_analysis: Optional[RiskAnalysis] = None
    similar_decisions: List[SimilarDecision] = []
    suggested_action: Optional[str] = None
    confidence_explanation: str = ""
```

## Risk Assessment & Mitigation

### High-Risk Areas

1. **State Management Complexity** 🔴
   - **Risk**: Concurrent access to pending reviews, race conditions
   - **Mitigation**: Atomic operations, proper locking, comprehensive testing

2. **SSE Connection Stability** 🟡
   - **Risk**: Connection drops, missed events, memory leaks
   - **Mitigation**: Robust error handling, connection recycling, heartbeat monitoring

3. **Configuration Hot-reload** 🟡
   - **Risk**: Inconsistent state during reload, validation failures
   - **Mitigation**: Atomic configuration updates, rollback capability, validation locks

### Medium-Risk Areas

1. **API Compatibility** 🟡
   - **Risk**: Frontend expectations not matching backend implementation
   - **Mitigation**: Extensive integration testing, API contract validation

2. **Performance Impact** 🟡
   - **Risk**: Additional database queries, SSE overhead
   - **Mitigation**: Caching strategies, connection pooling, performance monitoring

### Low-Risk Areas

1. **UI Component Reuse** 🟢
   - **Risk**: Minor styling or behavior differences
   - **Mitigation**: Thorough UI testing, gradual rollout

2. **Data Migration** 🟢
   - **Risk**: N/A - fresh start approach
   - **Mitigation**: N/A

## Testing Strategy

### Phase 1 Testing
- [ ] API endpoint compatibility tests
- [ ] SSE connection and event delivery tests
- [ ] UI component rendering with new data
- [ ] Performance baseline establishment

### Phase 2 Testing  
- [ ] Rule CRUD operation tests
- [ ] Configuration validation tests
- [ ] Hot-reload functionality tests
- [ ] Multi-evaluator rule engine tests

### Phase 3 Testing
- [ ] Approval/denial workflow tests
- [ ] Timeout handling tests
- [ ] Concurrent review management tests
- [ ] State transition integrity tests

### Phase 4 Testing
- [ ] AI assistance integration tests
- [ ] Risk analysis accuracy tests
- [ ] Similar decision matching tests
- [ ] Rule suggestion quality tests

## Success Metrics

### Phase 1 Success Criteria
- [ ] Frontend loads and displays audit history
- [ ] SSE updates work without connection drops
- [ ] API response times < 200ms for audit queries
- [ ] Zero data corruption or inconsistency

### Phase 2 Success Criteria
- [ ] All rule CRUD operations work via UI
- [ ] Configuration changes take effect within 5 seconds
- [ ] Rule validation catches 100% of syntax errors
- [ ] Mixed rule types evaluate correctly

### Phase 3 Success Criteria
- [ ] Manual approvals complete within expected timeframes
- [ ] Timeout handling works correctly 100% of time
- [ ] No lost or duplicate approval decisions
- [ ] Complete audit trail of all human decisions

### Phase 4 Success Criteria
- [ ] AI assistance improves decision speed by 30%+
- [ ] Risk analysis accuracy > 80% correlation with human judgment
- [ ] Rule suggestions reduce manual reviews by 20%+
- [ ] No degradation in system performance

## Future Enhancements

### Post-Migration Improvements
1. **Persistent Storage**: Replace in-memory storage with database persistence
2. **Advanced Analytics**: Decision pattern analysis and reporting
3. **Multi-tenant Support**: Separate configurations per organization/team
4. **Integration Expansion**: Support for additional Claude Code hook types
5. **Machine Learning**: Automated rule generation from decision patterns

### Monitoring & Observability
1. **Metrics Dashboard**: Decision rates, approval rates, timeout rates
2. **Performance Monitoring**: API latency, SSE connection health
3. **Audit Reporting**: Compliance and security reporting
4. **Alerting**: Failed decisions, configuration errors, system health

## Conclusion

This migration plan provides a comprehensive roadmap for transitioning from cco-mcp to superego-mcp backend while preserving existing functionality and enabling future enhancements. The phased approach minimizes risk while delivering value incrementally.

The unified rule evaluation model serves as the foundation for supporting both simple pattern-based rules and advanced AI-powered evaluation, providing flexibility for different deployment scenarios and gradual automation adoption.

**Key Success Factors**:
1. Thorough testing at each phase boundary
2. Maintaining UI stability throughout migration
3. Robust state management for human review workflows
4. Performance optimization for real-time updates
5. Clear rollback procedures for each phase

**Next Steps**:
1. Review and approve this migration plan
2. Begin Phase 1 implementation with observe-only mode
3. Establish testing infrastructure and success metrics
4. Plan detailed implementation milestones for each phase

For detailed implementation specifications, see the supporting documents:
- [Unified Rule Model Specification](./unified-rule-model.md)
- [Phase 1 Implementation Details](./phase-1-observe-only.md)
- [Phase 2 Implementation Details](./phase-2-rule-management.md)  
- [Phase 3 Implementation Details](./phase-3-human-escalation.md)
- [Phase 4 Implementation Details](./phase-4-ai-assistance.md)