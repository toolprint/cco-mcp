# Unified Rule Evaluation Model

## Overview

This document specifies the design of a unified rule evaluation system for superego-mcp that supports multiple evaluation strategies, including pattern matching, AI sampling, and human review escalation.

## Current State Analysis

### CCO-MCP Rule System
- Simple pattern-based matching (`ToolMatch` discriminated union)
- Built-in vs MCP tool distinction
- Priority-based rule ordering
- Actions: `auto_approve`, `auto_deny`, `needs_review`

### Superego-MCP Rule System
- AI-powered evaluation with `SecurityRule` model
- Complex pattern matching with conditions
- Actions: `allow`, `deny`, `sample`
- Integrated with AI sampling engine

## Unified Design

### Core Interface

```python
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from enum import Enum

class RuleAction(Enum):
    """Possible actions for rule evaluation"""
    ALWAYS_ALLOW = "always_allow"
    ALWAYS_DENY = "always_deny"
    DELEGATE_TO_AGENT = "delegate_to_agent"
    ESCALATE_TO_HUMAN = "escalate_to_human"
    CONDITIONAL = "conditional"  # For complex logic

class RuleEvaluator(ABC):
    """Abstract interface for rule evaluation strategies"""
    
    @abstractmethod
    async def evaluate(
        self, 
        request: ToolRequest, 
        rule_config: Dict[str, Any]
    ) -> RuleEvaluationResult:
        """Evaluate a tool request against this rule type"""
        pass
    
    @abstractmethod
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate rule configuration for this evaluator type"""
        pass
```

### Rule Configuration Schema

```yaml
# unified-rule.yaml
rules:
  - id: "simple-read-approve"
    name: "Auto-approve safe read operations"
    enabled: true
    priority: 100
    evaluator:
      type: "pattern"
      config:
        tool_patterns:
          - name: "Read"
            type: "builtin"
        action: "always_allow"
        
  - id: "ai-eval-write-ops"
    name: "AI evaluation for write operations"
    enabled: true
    priority: 200
    evaluator:
      type: "delegate_to_agent"
      config:
        tool_patterns:
          - name: "Write"
            type: "builtin"
          - name: "Edit"
            type: "builtin"
        sampling_config:
          providers: ["claude-3.5-sonnet"]
          confidence_threshold: 0.7
        fallback_action: "escalate_to_human"
        
  - id: "high-risk-manual"
    name: "Manual review for high-risk operations"
    enabled: true
    priority: 50
    evaluator:
      type: "escalate_to_human"
      config:
        tool_patterns:
          - name: "Bash"
            type: "builtin"
            parameter_conditions:
              command:
                contains: ["rm ", "sudo ", "curl "]
        timeout_seconds: 300
        timeout_action: "always_deny"
        
  - id: "conditional-logic"
    name: "Complex conditional evaluation"
    enabled: true
    priority: 150
    evaluator:
      type: "conditional"
      config:
        conditions:
          - if: 
              and:
                - tool_name: "Bash"
                - parameter_contains:
                    command: "git"
            then: "always_allow"
          - if:
              or:
                - parameter_contains:
                    command: "rm -rf"
                - parameter_contains:
                    file_path: "/etc/"
            then: "escalate_to_human"
        default_action: "delegate_to_agent"
```

### Rule Evaluators Implementation

#### 1. Pattern Evaluator
```python
class PatternRuleEvaluator(RuleEvaluator):
    """Simple pattern-based matching (similar to current cco-mcp)"""
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        tool_patterns = rule_config.get("tool_patterns", [])
        
        for pattern in tool_patterns:
            if self._matches_pattern(request, pattern):
                action = rule_config.get("action", "always_deny")
                return RuleEvaluationResult(
                    action=RuleAction(action),
                    confidence=1.0,
                    reason=f"Pattern match: {pattern}",
                    evaluator_type="pattern"
                )
        
        return RuleEvaluationResult(
            action=None,  # No match
            confidence=0.0,
            reason="No pattern match",
            evaluator_type="pattern"
        )
```

#### 2. Delegate to Agent Evaluator
```python
class DelegateToAgentRuleEvaluator(RuleEvaluator):
    """AI-powered evaluation (current superego-mcp logic)"""
    
    def __init__(self, security_policy: SecurityPolicyEngine):
        self.security_policy = security_policy
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        # Check if request matches this rule's patterns first
        if not self._matches_patterns(request, rule_config.get("tool_patterns", [])):
            return RuleEvaluationResult(action=None, confidence=0.0, reason="No pattern match")
        
        # Delegate to AI evaluation
        decision = await self.security_policy.evaluate(request)
        
        # Convert Decision to RuleEvaluationResult
        action_mapping = {
            "allow": RuleAction.ALWAYS_ALLOW,
            "deny": RuleAction.ALWAYS_DENY,
            "ask": RuleAction.DELEGATE_TO_AGENT  # Delegate to agent evaluation
        }
        
        return RuleEvaluationResult(
            action=action_mapping.get(decision.action, RuleAction.ALWAYS_DENY),
            confidence=decision.confidence,
            reason=decision.reason,
            evaluator_type="delegate_to_agent",
            ai_metadata={
                "provider": decision.ai_provider,
                "model": decision.ai_model,
                "processing_time_ms": decision.processing_time_ms
            }
        )
```

#### 3. Escalate to Human Evaluator
```python
class EscalateToHumanRuleEvaluator(RuleEvaluator):
    """Manual human review (new capability)"""
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        # Check pattern match
        if not self._matches_patterns(request, rule_config.get("tool_patterns", [])):
            return RuleEvaluationResult(action=None, confidence=0.0, reason="No pattern match")
        
        # This will create a pending review entry
        return RuleEvaluationResult(
            action=RuleAction.ESCALATE_TO_HUMAN,
            confidence=1.0,
            reason="Requires human review per security policy",
            evaluator_type="escalate_to_human",
            review_metadata={
                "timeout_seconds": rule_config.get("timeout_seconds", 300),
                "timeout_action": rule_config.get("timeout_action", "always_deny"),
                "priority": rule_config.get("review_priority", "normal")
            }
        )
```

#### 4. Conditional Evaluator
```python
class ConditionalRuleEvaluator(RuleEvaluator):
    """Complex conditional logic evaluation"""
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        conditions = rule_config.get("conditions", [])
        
        for condition in conditions:
            if await self._evaluate_condition(request, condition["if"]):
                action = condition["then"]
                
                # Handle recursive evaluation for complex actions
                if action in ["delegate_to_agent", "escalate_to_human"]:
                    # Could delegate to other evaluators
                    pass
                
                return RuleEvaluationResult(
                    action=RuleAction(action),
                    confidence=0.9,
                    reason=f"Conditional match: {condition['if']}",
                    evaluator_type="conditional"
                )
        
        # Default action
        default_action = rule_config.get("default_action", "always_deny")
        return RuleEvaluationResult(
            action=RuleAction(default_action),
            confidence=0.5,
            reason="Default action for conditional rule",
            evaluator_type="conditional"
        )
```

### Unified Rule Engine

```python
class UnifiedRuleEngine:
    """Main rule evaluation engine supporting multiple strategies"""
    
    def __init__(self):
        self.evaluators = {
            "pattern": PatternRuleEvaluator(),
            "delegate_to_agent": DelegateToAgentRuleEvaluator(security_policy),
            "escalate_to_human": EscalateToHumanRuleEvaluator(),
            "conditional": ConditionalRuleEvaluator()
        }
        self.rules: List[UnifiedRule] = []
    
    async def evaluate_request(self, request: ToolRequest) -> Decision:
        """Evaluate request against all rules in priority order"""
        import uuid
        from datetime import datetime, timedelta
        
        decision_id = str(uuid.uuid4())
        start_time = datetime.now()
        rule_count = 0
        escalation_chain = []
        
        for rule in sorted(self.rules, key=lambda r: r.priority):
            if not rule.enabled:
                continue
            
            rule_count += 1
            evaluator = self.evaluators.get(rule.evaluator.type)
            if not evaluator:
                continue
            
            result = await evaluator.evaluate(request, rule.evaluator.config)
            
            if result.action is not None:
                # Rule matched, convert to Decision
                action_map = {
                    RuleAction.ALWAYS_ALLOW: "allow",
                    RuleAction.ALWAYS_DENY: "deny",
                    RuleAction.DELEGATE_TO_AGENT: "ask",
                    RuleAction.ESCALATE_TO_HUMAN: "ask"
                }
                
                decision = Decision(
                    action=action_map.get(result.action, "deny"),
                    reason=result.reason,
                    decision_id=decision_id
                )
                
                # Add observability metadata
                decision.observability = ObservabilityMetadata(
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                    timestamp=datetime.now(),
                    rule_evaluation_count=rule_count,
                    escalation_chain=[rule.name]
                )
                
                # Add agent metadata if from AI evaluation
                if result.action == RuleAction.DELEGATE_TO_AGENT and result.metadata:
                    decision.agent_metadata = AgentDecisionMetadata(
                        confidence=result.metadata.get("confidence", 0.5),
                        provider=result.metadata.get("provider"),
                        model=result.metadata.get("model")
                    )
                
                # Add human escalation metadata if needed
                if result.action == RuleAction.ESCALATE_TO_HUMAN and result.metadata:
                    timeout_seconds = result.metadata.get("timeout_seconds", 300)
                    decision.human_metadata = HumanEscalationMetadata(
                        escalated_at=datetime.now(),
                        timeout_at=datetime.now() + timedelta(seconds=timeout_seconds),
                        timeout_action=result.metadata.get("timeout_action", "deny")
                    )
                
                return decision
        
        # No rules matched, apply default policy
        return Decision(
            action="deny",
            reason="No rules matched - default deny policy",
            decision_id=decision_id,
            observability=ObservabilityMetadata(
                processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                timestamp=datetime.now(),
                rule_evaluation_count=rule_count,
                escalation_chain=["default_policy"]
            )
        )
```

## Data Models

### Core Models

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class AgentDecisionMetadata(BaseModel):
    """Metadata from agent evaluation"""
    confidence: float
    provider: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: Optional[int] = None
    agent_id: Optional[str] = None

class HumanEscalationMetadata(BaseModel):
    """Metadata for human escalation tracking"""
    escalated_at: datetime
    timeout_at: datetime
    timeout_action: str
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_reason: Optional[str] = None
    priority: str = Field(default="normal")

class ObservabilityMetadata(BaseModel):
    """Observability and statistics metadata"""
    processing_time_ms: int
    timestamp: datetime
    rule_evaluation_count: int = Field(default=0)
    escalation_chain: Optional[List[str]] = None

class Decision(BaseModel):
    """Unified decision model matching Claude Code Hook schema"""
    action: str  # "allow", "deny", "ask"
    reason: str  # Required non-empty string
    
    # Optional metadata structures
    agent_metadata: Optional[AgentDecisionMetadata] = None
    human_metadata: Optional[HumanEscalationMetadata] = None
    observability: Optional[ObservabilityMetadata] = None
    
    # Escalation chain tracking
    escalation_history: Optional[List[Dict[str, Any]]] = None
    parent_decision_id: Optional[str] = None
    decision_id: Optional[str] = None  # Unique ID for tracking through lifecycle

class RuleEvaluationResult(BaseModel):
    """Result of individual rule evaluation"""
    action: Optional[RuleAction] = None
    reason: str
    evaluator_type: str
    metadata: Optional[Dict[str, Any]] = None

class RuleEvaluatorConfig(BaseModel):
    """Configuration for specific evaluator type"""
    type: str  # "pattern", "delegate_to_agent", "escalate_to_human", "conditional"
    config: Dict[str, Any]

class UnifiedRule(BaseModel):
    """Unified rule configuration"""
    id: str
    name: str
    enabled: bool
    priority: int
    evaluator: RuleEvaluatorConfig
    description: Optional[str] = None
    tags: Optional[List[str]] = None
```

## Migration Strategy

### Phase 1: Implement Pattern Evaluator
- Replace current SecurityRule with UnifiedRule
- Implement PatternRuleEvaluator for CCO-MCP compatibility
- Map existing CCO-MCP rules to pattern evaluator format

### Phase 2: Add Delegate to Agent Evaluator
- Integrate existing SecurityPolicyEngine as DelegateToAgentRuleEvaluator
- Support mixed pattern + AI-agent rules
- Maintain backward compatibility with current superego rules

### Phase 3: Add Escalate to Human Evaluator
- Implement EscalateToHumanRuleEvaluator
- Add pending review state management
- Integrate with approval/denial workflow

### Phase 4: Add Conditional Evaluator
- Implement complex conditional logic
- Support rule composition and delegation
- Advanced pattern matching capabilities

## Resilience Patterns

### Circuit Breaker Implementation

```python
# File: src/superego_mcp/infrastructure/resilience.py

import asyncio
from typing import Any, Callable, Optional
from datetime import datetime, timedelta
from enum import Enum
from pydantic import BaseModel, Field
import structlog

logger = structlog.get_logger(__name__)

class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing recovery

class CircuitBreakerConfig(BaseModel):
    """Configuration for circuit breaker"""
    failure_threshold: int = Field(default=5, ge=1)
    success_threshold: int = Field(default=2, ge=1)
    timeout_seconds: int = Field(default=60, ge=1)
    half_open_max_calls: int = Field(default=3, ge=1)

class CircuitBreaker:
    """Simple circuit breaker for external service calls"""
    
    def __init__(self, config: CircuitBreakerConfig = None):
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.half_open_calls = 0
        self._lock = asyncio.Lock()
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection"""
        async with self._lock:
            # Check if circuit should transition from OPEN to HALF_OPEN
            if self.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self.state = CircuitState.HALF_OPEN
                    self.half_open_calls = 0
                    logger.info("Circuit breaker transitioning to HALF_OPEN")
                else:
                    raise CircuitOpenError("Circuit breaker is OPEN")
            
            # Check HALF_OPEN call limit
            if self.state == CircuitState.HALF_OPEN:
                if self.half_open_calls >= self.config.half_open_max_calls:
                    raise CircuitOpenError("Circuit breaker HALF_OPEN call limit reached")
                self.half_open_calls += 1
        
        try:
            # Execute the function
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure()
            raise
    
    async def _on_success(self):
        """Handle successful call"""
        async with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.success_count += 1
                if self.success_count >= self.config.success_threshold:
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
                    self.success_count = 0
                    logger.info("Circuit breaker closed after successful recovery")
            elif self.state == CircuitState.CLOSED:
                self.failure_count = 0  # Reset on success
    
    async def _on_failure(self):
        """Handle failed call"""
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now()
            
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                logger.warning("Circuit breaker reopened after failure in HALF_OPEN")
            elif self.state == CircuitState.CLOSED:
                if self.failure_count >= self.config.failure_threshold:
                    self.state = CircuitState.OPEN
                    logger.warning(
                        "Circuit breaker opened after failures",
                        failure_count=self.failure_count
                    )
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset"""
        if not self.last_failure_time:
            return True
        timeout = timedelta(seconds=self.config.timeout_seconds)
        return datetime.now() - self.last_failure_time > timeout

class CircuitOpenError(Exception):
    """Raised when circuit breaker is open"""
    pass
```

### Retry with Exponential Backoff

```python
# File: src/superego_mcp/infrastructure/retry.py

import asyncio
import random
from typing import Any, Callable, Optional, Set, Type
from pydantic import BaseModel, Field

class RetryConfig(BaseModel):
    """Configuration for retry logic"""
    max_attempts: int = Field(default=3, ge=1)
    initial_delay_ms: int = Field(default=100, ge=1)
    max_delay_ms: int = Field(default=10000, ge=1)
    exponential_base: float = Field(default=2.0, ge=1.0)
    jitter: bool = Field(default=True)
    retryable_exceptions: Set[Type[Exception]] = Field(default_factory=lambda: {Exception})

class RetryManager:
    """Manages retry logic with exponential backoff"""
    
    def __init__(self, config: RetryConfig = None):
        self.config = config or RetryConfig()
    
    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with retry logic"""
        last_exception = None
        
        for attempt in range(self.config.max_attempts):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                
                # Check if exception is retryable
                if not any(isinstance(e, exc_type) for exc_type in self.config.retryable_exceptions):
                    raise
                
                # Don't sleep after last attempt
                if attempt < self.config.max_attempts - 1:
                    delay = self._calculate_delay(attempt)
                    logger.info(
                        "Retrying after failure",
                        attempt=attempt + 1,
                        delay_ms=delay,
                        error=str(e)
                    )
                    await asyncio.sleep(delay / 1000.0)
        
        # All attempts failed
        raise last_exception
    
    def _calculate_delay(self, attempt: int) -> int:
        """Calculate delay with exponential backoff and optional jitter"""
        delay = min(
            self.config.initial_delay_ms * (self.config.exponential_base ** attempt),
            self.config.max_delay_ms
        )
        
        if self.config.jitter:
            # Add random jitter (±25%)
            jitter_range = delay * 0.25
            delay += random.uniform(-jitter_range, jitter_range)
        
        return int(delay)
```

### Integration with Rule Evaluators

```python
# File: src/superego_mcp/domain/evaluators/resilient_delegate.py

class ResilientDelegateToAgentEvaluator(DelegateToAgentRuleEvaluator):
    """Delegate to agent evaluator with resilience patterns"""
    
    def __init__(self, security_policy: SecurityPolicyEngine):
        super().__init__(security_policy)
        self.circuit_breaker = CircuitBreaker(
            CircuitBreakerConfig(
                failure_threshold=3,
                timeout_seconds=30
            )
        )
        self.retry_manager = RetryManager(
            RetryConfig(
                max_attempts=3,
                initial_delay_ms=500,
                retryable_exceptions={TimeoutError, ConnectionError}
            )
        )
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        """Evaluate with circuit breaker and retry protection"""
        try:
            # Wrap the evaluation in both circuit breaker and retry logic
            async def protected_evaluate():
                return await self.circuit_breaker.call(
                    super().evaluate,
                    request,
                    rule_config
                )
            
            return await self.retry_manager.execute(protected_evaluate)
            
        except CircuitOpenError:
            # Circuit is open, return fallback
            logger.warning("Circuit breaker open, using fallback action")
            fallback_action = rule_config.get("fallback_action", "always_deny")
            
            return RuleEvaluationResult(
                action=RuleAction(fallback_action),
                confidence=0.1,
                reason="AI service unavailable (circuit breaker open) - fallback action applied",
                evaluator_type="delegate_to_agent",
                metadata={"circuit_breaker": "open"}
            )
        
        except Exception as e:
            # All retries failed
            logger.error("All retry attempts failed", error=str(e))
            fallback_action = rule_config.get("fallback_action", "always_deny")
            
            return RuleEvaluationResult(
                action=RuleAction(fallback_action),
                confidence=0.1,
                reason=f"AI service failed after retries: {str(e)}",
                evaluator_type="delegate_to_agent",
                metadata={"error": str(e)}
            )
```

### Fallback Strategies

```python
class FallbackStrategy(Enum):
    """Strategies for handling service failures"""
    ALWAYS_DENY = "always_deny"        # Secure default
    ALWAYS_ALLOW = "always_allow"      # Permissive (use with caution)
    ESCALATE_TO_HUMAN = "escalate_to_human"  # Manual review
    USE_CACHE = "use_cache"            # Use cached decision if available
    DELEGATE_TO_SIMPLE = "delegate_to_simple"  # Fall back to pattern matching

class UnifiedRuleEngineWithResilience(UnifiedRuleEngine):
    """Enhanced rule engine with resilience patterns"""
    
    def __init__(self):
        super().__init__()
        self.decision_cache = {}  # Simple TTL cache
        self.cache_ttl = timedelta(minutes=5)
        
        # Wrap evaluators with resilience
        self.evaluators["delegate_to_agent"] = ResilientDelegateToAgentEvaluator(
            self.security_policy
        )
    
    async def evaluate_request(self, request: ToolRequest) -> Decision:
        """Evaluate with fallback strategies"""
        try:
            # Check cache first
            cache_key = self._get_cache_key(request)
            if cache_key in self.decision_cache:
                cached_decision, cached_time = self.decision_cache[cache_key]
                if datetime.now() - cached_time < self.cache_ttl:
                    logger.info("Using cached decision", cache_key=cache_key)
                    return cached_decision
            
            # Normal evaluation
            decision = await super().evaluate_request(request)
            
            # Cache successful decision
            self.decision_cache[cache_key] = (decision, datetime.now())
            
            return decision
            
        except Exception as e:
            logger.error("Rule evaluation failed, applying fallback", error=str(e))
            
            # Apply fallback strategy
            return Decision(
                action="deny",  # Secure default
                reason=f"Evaluation failed - secure default applied: {str(e)}",
                decision_id=str(uuid.uuid4())
            )
```

## Benefits

1. **Flexibility**: Supports multiple evaluation strategies in one system
2. **Backwards Compatibility**: Can map both CCO-MCP and Superego-MCP rules
3. **Extensibility**: Easy to add new evaluator types
4. **Composability**: Rules can delegate to other evaluators
5. **Gradual Migration**: Can migrate rule-by-rule without breaking changes
6. **Testing**: Each evaluator can be tested independently

## Configuration Migration

### From CCO-MCP ApprovalRule
```typescript
// Old CCO-MCP format
{
  "id": "auto-approve-reads",
  "tool": { "type": "builtin", "toolName": "Read" },
  "action": "always_allow"
}

// New unified format
{
  "id": "auto-approve-reads",
  "evaluator": {
    "type": "pattern",
    "config": {
      "tool_patterns": [{"name": "Read", "type": "builtin"}],
      "action": "always_allow"
    }
  }
}
```

### From Superego-MCP SecurityRule
```yaml
# Old superego format
- id: "write-operations"
  conditions:
    - tool_name: "Write"
  action: "sample"

# New unified format
- id: "write-operations"
  evaluator:
    type: "delegate_to_agent"
    config:
      tool_patterns:
        - name: "Write"
          type: "builtin"
      sampling_config:
        providers: ["claude-3.5-sonnet"]
```

This unified model provides a foundation for supporting all current capabilities while enabling future enhancements through the extensible evaluator interface.