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
    AUTO_APPROVE = "auto_approve"
    AUTO_DENY = "auto_deny"
    AI_SAMPLE = "ai_sample"
    HUMAN_REVIEW = "human_review"
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
        action: "auto_approve"
        
  - id: "ai-eval-write-ops"
    name: "AI evaluation for write operations"
    enabled: true
    priority: 200
    evaluator:
      type: "ai_sample"
      config:
        tool_patterns:
          - name: "Write"
            type: "builtin"
          - name: "Edit"
            type: "builtin"
        sampling_config:
          providers: ["claude-3.5-sonnet"]
          confidence_threshold: 0.7
        fallback_action: "human_review"
        
  - id: "high-risk-manual"
    name: "Manual review for high-risk operations"
    enabled: true
    priority: 50
    evaluator:
      type: "human_review"
      config:
        tool_patterns:
          - name: "Bash"
            type: "builtin"
            parameter_conditions:
              command:
                contains: ["rm ", "sudo ", "curl "]
        timeout_seconds: 300
        timeout_action: "auto_deny"
        
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
            then: "auto_approve"
          - if:
              or:
                - parameter_contains:
                    command: "rm -rf"
                - parameter_contains:
                    file_path: "/etc/"
            then: "human_review"
        default_action: "ai_sample"
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
                action = rule_config.get("action", "auto_deny")
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

#### 2. AI Sample Evaluator
```python
class AISampleRuleEvaluator(RuleEvaluator):
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
            "allow": RuleAction.AUTO_APPROVE,
            "deny": RuleAction.AUTO_DENY,
            "sample": RuleAction.AI_SAMPLE  # Re-sample with different config
        }
        
        return RuleEvaluationResult(
            action=action_mapping.get(decision.action, RuleAction.AUTO_DENY),
            confidence=decision.confidence,
            reason=decision.reason,
            evaluator_type="ai_sample",
            ai_metadata={
                "provider": decision.ai_provider,
                "model": decision.ai_model,
                "processing_time_ms": decision.processing_time_ms
            }
        )
```

#### 3. Human Review Evaluator
```python
class HumanReviewRuleEvaluator(RuleEvaluator):
    """Manual human review (new capability)"""
    
    async def evaluate(self, request: ToolRequest, rule_config: Dict[str, Any]) -> RuleEvaluationResult:
        # Check pattern match
        if not self._matches_patterns(request, rule_config.get("tool_patterns", [])):
            return RuleEvaluationResult(action=None, confidence=0.0, reason="No pattern match")
        
        # This will create a pending review entry
        return RuleEvaluationResult(
            action=RuleAction.HUMAN_REVIEW,
            confidence=1.0,
            reason="Requires human review per security policy",
            evaluator_type="human_review",
            review_metadata={
                "timeout_seconds": rule_config.get("timeout_seconds", 300),
                "timeout_action": rule_config.get("timeout_action", "auto_deny"),
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
                if action in ["ai_sample", "human_review"]:
                    # Could delegate to other evaluators
                    pass
                
                return RuleEvaluationResult(
                    action=RuleAction(action),
                    confidence=0.9,
                    reason=f"Conditional match: {condition['if']}",
                    evaluator_type="conditional"
                )
        
        # Default action
        default_action = rule_config.get("default_action", "auto_deny")
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
            "ai_sample": AISampleRuleEvaluator(security_policy),
            "human_review": HumanReviewRuleEvaluator(),
            "conditional": ConditionalRuleEvaluator()
        }
        self.rules: List[UnifiedRule] = []
    
    async def evaluate_request(self, request: ToolRequest) -> FinalDecision:
        """Evaluate request against all rules in priority order"""
        
        for rule in sorted(self.rules, key=lambda r: r.priority):
            if not rule.enabled:
                continue
            
            evaluator = self.evaluators.get(rule.evaluator.type)
            if not evaluator:
                continue
            
            result = await evaluator.evaluate(request, rule.evaluator.config)
            
            if result.action is not None:
                # Rule matched, return decision
                return FinalDecision(
                    action=result.action,
                    confidence=result.confidence,
                    reason=result.reason,
                    rule_id=rule.id,
                    rule_name=rule.name,
                    evaluator_type=result.evaluator_type,
                    metadata=result.metadata
                )
        
        # No rules matched, apply default policy
        return FinalDecision(
            action=RuleAction.AUTO_DENY,
            confidence=0.8,
            reason="No rules matched - default deny",
            rule_id=None,
            rule_name="default_policy",
            evaluator_type="default"
        )
```

## Data Models

### Core Models

```python
from dataclasses import dataclass
from typing import Optional, Dict, Any
from datetime import datetime

@dataclass
class RuleEvaluationResult:
    """Result of individual rule evaluation"""
    action: Optional[RuleAction]
    confidence: float
    reason: str
    evaluator_type: str
    metadata: Optional[Dict[str, Any]] = None
    ai_metadata: Optional[Dict[str, Any]] = None
    review_metadata: Optional[Dict[str, Any]] = None

@dataclass
class FinalDecision:
    """Final decision after rule evaluation"""
    action: RuleAction
    confidence: float
    reason: str
    rule_id: Optional[str]
    rule_name: str
    evaluator_type: str
    metadata: Optional[Dict[str, Any]] = None
    timestamp: datetime = None
    processing_time_ms: int = 0

@dataclass
class UnifiedRule:
    """Unified rule configuration"""
    id: str
    name: str
    enabled: bool
    priority: int
    evaluator: RuleEvaluatorConfig
    description: Optional[str] = None
    tags: List[str] = None

@dataclass
class RuleEvaluatorConfig:
    """Configuration for specific evaluator type"""
    type: str  # "pattern", "ai_sample", "human_review", "conditional"
    config: Dict[str, Any]
```

## Migration Strategy

### Phase 1: Implement Pattern Evaluator
- Replace current SecurityRule with UnifiedRule
- Implement PatternRuleEvaluator for CCO-MCP compatibility
- Map existing CCO-MCP rules to pattern evaluator format

### Phase 2: Add AI Sample Evaluator
- Integrate existing SecurityPolicyEngine as AISampleRuleEvaluator
- Support mixed pattern + AI rules
- Maintain backward compatibility with current superego rules

### Phase 3: Add Human Review Evaluator
- Implement HumanReviewRuleEvaluator
- Add pending review state management
- Integrate with approval/denial workflow

### Phase 4: Add Conditional Evaluator
- Implement complex conditional logic
- Support rule composition and delegation
- Advanced pattern matching capabilities

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
  "action": "auto_approve"
}

// New unified format
{
  "id": "auto-approve-reads",
  "evaluator": {
    "type": "pattern",
    "config": {
      "tool_patterns": [{"name": "Read", "type": "builtin"}],
      "action": "auto_approve"
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
    type: "ai_sample"
    config:
      tool_patterns:
        - name: "Write"
          type: "builtin"
      sampling_config:
        providers: ["claude-3.5-sonnet"]
```

This unified model provides a foundation for supporting all current capabilities while enabling future enhancements through the extensible evaluator interface.