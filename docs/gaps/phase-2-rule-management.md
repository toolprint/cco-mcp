# Phase 2: Rule Management Implementation

## Overview

Phase 2 builds on the observe-only foundation from Phase 1 by adding comprehensive rule management capabilities. Users can create, update, delete, and test rules through the UI, with support for both simple pattern-based rules (CCO-MCP style) and AI-powered evaluation rules (Superego-MCP style).

## Goals

- ✅ Enable full CRUD operations for rules via the UI
- ✅ Support both pattern-based and AI-powered rule evaluation
- ✅ Implement rule validation and testing capabilities
- ✅ Add hot-reload for configuration changes
- ✅ Maintain backward compatibility with existing superego rules
- ✅ Provide migration path from CCO-MCP rule format

## Architecture Changes

### Backend Extensions (superego-mcp)

#### 1. Unified Rule Configuration Model

```python
# File: src/superego_mcp/domain/unified_rules.py

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Union
from enum import Enum
import uuid
from datetime import datetime

class RuleEvaluatorType(Enum):
    """Types of rule evaluators supported"""
    PATTERN = "pattern"                      # Simple pattern matching
    DELEGATE_TO_AGENT = "delegate_to_agent"  # AI-powered evaluation  
    ESCALATE_TO_HUMAN = "escalate_to_human" # Manual review (Phase 3)
    CONDITIONAL = "conditional"              # Complex conditional logic (Phase 4)

@dataclass
class ToolPattern:
    """Pattern for matching tools"""
    name: str                    # Tool name (e.g., "Read", "Write")
    type: str = "builtin"       # "builtin" or "mcp"
    server_name: Optional[str] = None  # For MCP tools
    parameter_conditions: Optional[Dict[str, Any]] = None  # Parameter matching

@dataclass
class RuleEvaluatorConfig:
    """Configuration for a specific evaluator type"""
    type: RuleEvaluatorType
    config: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "config": self.config
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RuleEvaluatorConfig':
        return cls(
            type=RuleEvaluatorType(data["type"]),
            config=data.get("config", {})
        )

@dataclass
class UnifiedRule:
    """Unified rule supporting multiple evaluation strategies"""
    id: str
    name: str
    description: Optional[str]
    enabled: bool
    priority: int
    evaluator: RuleEvaluatorConfig
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "enabled": self.enabled,
            "priority": self.priority,
            "evaluator": self.evaluator.to_dict(),
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by,
            "updated_by": self.updated_by
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UnifiedRule':
        """Create from dictionary (API input)"""
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            name=data["name"],
            description=data.get("description"),
            enabled=data.get("enabled", True),
            priority=data.get("priority", 100),
            evaluator=RuleEvaluatorConfig.from_dict(data["evaluator"]),
            tags=data.get("tags", []),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(),
            updated_at=datetime.fromisoformat(data["updated_at"]) if "updated_at" in data else datetime.now(),
            created_by=data.get("created_by"),
            updated_by=data.get("updated_by")
        )

    def update(self, updates: Dict[str, Any], updated_by: Optional[str] = None) -> None:
        """Update rule with new values"""
        for key, value in updates.items():
            if key == "evaluator" and isinstance(value, dict):
                self.evaluator = RuleEvaluatorConfig.from_dict(value)
            elif hasattr(self, key) and key not in ["id", "created_at", "created_by"]:
                setattr(self, key, value)
        
        self.updated_at = datetime.now()
        if updated_by:
            self.updated_by = updated_by
```

#### 2. Rule Storage and Management

```python
# File: src/superego_mcp/infrastructure/rule_storage.py

from typing import List, Optional, Dict, Any
import asyncio
import yaml
from pathlib import Path
import json
from ..domain.unified_rules import UnifiedRule

class UnifiedRuleStorage:
    """Storage and management for unified rules"""
    
    def __init__(self, rules_file_path: str, backup_enabled: bool = True):
        self.rules_file_path = Path(rules_file_path)
        self.backup_enabled = backup_enabled
        self._lock = asyncio.Lock()
        self._rules: Dict[str, UnifiedRule] = {}
        self._load_rules()
    
    def _load_rules(self) -> None:
        """Load rules from YAML file"""
        if not self.rules_file_path.exists():
            self._rules = {}
            return
        
        try:
            with open(self.rules_file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
            
            rules_data = data.get("rules", [])
            self._rules = {}
            
            for rule_data in rules_data:
                rule = UnifiedRule.from_dict(rule_data)
                self._rules[rule.id] = rule
                
        except Exception as e:
            raise ValueError(f"Failed to load rules from {self.rules_file_path}: {e}")
    
    async def _save_rules(self) -> None:
        """Save rules to YAML file with backup"""
        if self.backup_enabled and self.rules_file_path.exists():
            backup_path = self.rules_file_path.with_suffix(f".backup.{int(datetime.now().timestamp())}")
            backup_path.write_bytes(self.rules_file_path.read_bytes())
        
        # Convert rules to YAML format
        rules_data = {
            "rules": [rule.to_dict() for rule in sorted(self._rules.values(), key=lambda r: r.priority)]
        }
        
        # Write atomically
        temp_path = self.rules_file_path.with_suffix('.tmp')
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                yaml.dump(rules_data, f, default_flow_style=False, sort_keys=False)
            
            temp_path.replace(self.rules_file_path)
        finally:
            if temp_path.exists():
                temp_path.unlink()
    
    async def get_all_rules(self) -> List[UnifiedRule]:
        """Get all rules sorted by priority"""
        async with self._lock:
            return sorted(self._rules.values(), key=lambda r: r.priority)
    
    async def get_rule(self, rule_id: str) -> Optional[UnifiedRule]:
        """Get specific rule by ID"""
        async with self._lock:
            return self._rules.get(rule_id)
    
    async def create_rule(self, rule: UnifiedRule) -> UnifiedRule:
        """Create new rule"""
        async with self._lock:
            if rule.id in self._rules:
                raise ValueError(f"Rule with ID {rule.id} already exists")
            
            self._rules[rule.id] = rule
            await self._save_rules()
            return rule
    
    async def update_rule(self, rule_id: str, updates: Dict[str, Any], updated_by: Optional[str] = None) -> Optional[UnifiedRule]:
        """Update existing rule"""
        async with self._lock:
            rule = self._rules.get(rule_id)
            if not rule:
                return None
            
            rule.update(updates, updated_by)
            await self._save_rules()
            return rule
    
    async def delete_rule(self, rule_id: str) -> bool:
        """Delete rule"""
        async with self._lock:
            if rule_id not in self._rules:
                return False
            
            del self._rules[rule_id]
            await self._save_rules()
            return True
    
    async def reload_rules(self) -> None:
        """Reload rules from file"""
        async with self._lock:
            self._load_rules()
```

#### 3. Rule Validation System

```python
# File: src/superego_mcp/domain/rule_validation.py

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from ..domain.unified_rules import UnifiedRule, RuleEvaluatorType

@dataclass
class ValidationError:
    """Rule validation error"""
    field: str
    message: str
    severity: str = "error"  # "error", "warning", "info"

@dataclass 
class ValidationResult:
    """Result of rule validation"""
    valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationError]

class RuleValidator:
    """Validates unified rules"""
    
    def __init__(self):
        self.evaluator_validators = {
            RuleEvaluatorType.PATTERN: self._validate_pattern_evaluator,
            RuleEvaluatorType.AI_SAMPLE: self._validate_ai_sample_evaluator,
            RuleEvaluatorType.HUMAN_REVIEW: self._validate_human_review_evaluator,
            RuleEvaluatorType.CONDITIONAL: self._validate_conditional_evaluator,
        }
    
    def validate_rule(self, rule: UnifiedRule) -> ValidationResult:
        """Validate a unified rule"""
        errors = []
        warnings = []
        
        # Basic validation
        if not rule.name or not rule.name.strip():
            errors.append(ValidationError("name", "Rule name is required"))
        
        if rule.priority < 0:
            errors.append(ValidationError("priority", "Priority must be non-negative"))
        
        if rule.priority > 1000:
            warnings.append(ValidationError("priority", "High priority values may affect performance", "warning"))
        
        # Evaluator-specific validation
        evaluator_validator = self.evaluator_validators.get(rule.evaluator.type)
        if evaluator_validator:
            evaluator_errors = evaluator_validator(rule.evaluator.config)
            errors.extend(evaluator_errors)
        else:
            errors.append(ValidationError("evaluator.type", f"Unknown evaluator type: {rule.evaluator.type}"))
        
        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )
    
    def _validate_pattern_evaluator(self, config: Dict[str, Any]) -> List[ValidationError]:
        """Validate pattern evaluator configuration"""
        errors = []
        
        tool_patterns = config.get("tool_patterns", [])
        if not tool_patterns:
            errors.append(ValidationError("evaluator.config.tool_patterns", "At least one tool pattern is required"))
        
        for i, pattern in enumerate(tool_patterns):
            if not pattern.get("name"):
                errors.append(ValidationError(f"evaluator.config.tool_patterns[{i}].name", "Tool name is required"))
            
            if pattern.get("type") not in ["builtin", "mcp"]:
                errors.append(ValidationError(f"evaluator.config.tool_patterns[{i}].type", "Tool type must be 'builtin' or 'mcp'"))
        
        action = config.get("action")
        if action not in ["auto_approve", "auto_deny"]:
            errors.append(ValidationError("evaluator.config.action", "Action must be 'auto_approve' or 'auto_deny'"))
        
        return errors
    
    def _validate_ai_sample_evaluator(self, config: Dict[str, Any]) -> List[ValidationError]:
        """Validate AI sample evaluator configuration"""
        errors = []
        
        # Tool patterns validation (reuse pattern validator logic)
        pattern_errors = self._validate_pattern_evaluator({"tool_patterns": config.get("tool_patterns", []), "action": "auto_approve"})
        errors.extend([e for e in pattern_errors if "action" not in e.field])
        
        sampling_config = config.get("sampling_config", {})
        providers = sampling_config.get("providers", [])
        if not providers:
            errors.append(ValidationError("evaluator.config.sampling_config.providers", "At least one AI provider is required"))
        
        confidence_threshold = sampling_config.get("confidence_threshold")
        if confidence_threshold is not None and (confidence_threshold < 0 or confidence_threshold > 1):
            errors.append(ValidationError("evaluator.config.sampling_config.confidence_threshold", "Confidence threshold must be between 0 and 1"))
        
        fallback_action = config.get("fallback_action")
        if fallback_action and fallback_action not in ["auto_approve", "auto_deny", "human_review"]:
            errors.append(ValidationError("evaluator.config.fallback_action", "Fallback action must be 'auto_approve', 'auto_deny', or 'human_review'"))
        
        return errors
    
    def _validate_human_review_evaluator(self, config: Dict[str, Any]) -> List[ValidationError]:
        """Validate human review evaluator configuration (Phase 3)"""
        errors = []
        
        # For Phase 2, human review is not yet implemented
        errors.append(ValidationError("evaluator.type", "Human review evaluator not yet implemented (Phase 3)"))
        
        return errors
    
    def _validate_conditional_evaluator(self, config: Dict[str, Any]) -> List[ValidationError]:
        """Validate conditional evaluator configuration (Phase 4)"""
        errors = []
        
        # For Phase 2, conditional evaluator is not yet implemented  
        errors.append(ValidationError("evaluator.type", "Conditional evaluator not yet implemented (Phase 4)"))
        
        return errors

    def validate_rules_conflict(self, rules: List[UnifiedRule]) -> List[ValidationError]:
        """Check for conflicts between rules"""
        errors = []
        
        # Check for duplicate IDs
        ids_seen = set()
        for rule in rules:
            if rule.id in ids_seen:
                errors.append(ValidationError("id", f"Duplicate rule ID: {rule.id}"))
            ids_seen.add(rule.id)
        
        # Check for duplicate priorities (warning only)
        priorities = {}
        for rule in rules:
            if rule.priority in priorities:
                other_rule = priorities[rule.priority]
                errors.append(ValidationError(
                    "priority", 
                    f"Rule '{rule.name}' has same priority {rule.priority} as '{other_rule.name}'",
                    "warning"
                ))
            priorities[rule.priority] = rule
        
        return errors
```

#### 4. Rule Testing System

```python
# File: src/superego_mcp/domain/rule_testing.py

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from ..domain.models import ToolRequest
from ..domain.unified_rules import UnifiedRule

@dataclass
class RuleTestRequest:
    """Request for testing a rule"""
    rule: UnifiedRule
    test_cases: List[Dict[str, Any]]  # List of tool requests to test against

@dataclass
class RuleTestCase:
    """Individual test case"""
    tool_name: str
    parameters: Dict[str, Any]
    agent_id: str = "test_agent"
    session_id: str = "test_session"
    cwd: str = "/tmp"
    expected_action: Optional[str] = None  # Expected result for validation

@dataclass
class RuleTestResult:
    """Result of testing a rule against test cases"""
    rule_id: str
    rule_name: str
    test_results: List['TestCaseResult']
    overall_success: bool
    execution_time_ms: int

@dataclass
class TestCaseResult:
    """Result of individual test case"""
    test_case: RuleTestCase
    matched: bool
    action: Optional[str]
    reason: str
    confidence: float
    execution_time_ms: int
    expected_match: bool = True

class RuleTestEngine:
    """Engine for testing rules against sample data"""
    
    def __init__(self, rule_engine):
        self.rule_engine = rule_engine
    
    async def test_rule(self, rule: UnifiedRule, test_cases: List[RuleTestCase]) -> RuleTestResult:
        """Test a rule against multiple test cases"""
        start_time = time.time()
        test_results = []
        
        for test_case in test_cases:
            # Create tool request
            tool_request = ToolRequest(
                tool_name=test_case.tool_name,
                parameters=test_case.parameters,
                agent_id=test_case.agent_id,
                session_id=test_case.session_id,
                cwd=test_case.cwd
            )
            
            # Test against this specific rule
            case_start = time.time()
            try:
                # Temporarily set rules to just this one rule
                original_rules = self.rule_engine.rules
                self.rule_engine.rules = [rule]
                
                decision = await self.rule_engine.evaluate_request(tool_request)
                
                test_result = TestCaseResult(
                    test_case=test_case,
                    matched=decision.rule_id == rule.id,
                    action=decision.action.value if decision.action else None,
                    reason=decision.reason,
                    confidence=decision.confidence,
                    execution_time_ms=int((time.time() - case_start) * 1000),
                    expected_match=test_case.expected_action is None or test_case.expected_action == (decision.action.value if decision.action else None)
                )
                
            except Exception as e:
                test_result = TestCaseResult(
                    test_case=test_case,
                    matched=False,
                    action="error",
                    reason=f"Test execution failed: {str(e)}",
                    confidence=0.0,
                    execution_time_ms=int((time.time() - case_start) * 1000),
                    expected_match=False
                )
            
            finally:
                # Restore original rules
                self.rule_engine.rules = original_rules
            
            test_results.append(test_result)
        
        overall_success = all(result.expected_match for result in test_results)
        execution_time = int((time.time() - start_time) * 1000)
        
        return RuleTestResult(
            rule_id=rule.id,
            rule_name=rule.name,
            test_results=test_results,
            overall_success=overall_success,
            execution_time_ms=execution_time
        )
```

#### 5. New API Endpoints

```python
# File: src/superego_mcp/presentation/unified_server.py

# Add these endpoints to _setup_fastapi_routes():

@self.fastapi.get("/v1/config/rules")
async def get_all_rules() -> Dict[str, Any]:
    """Get all rules with metadata"""
    try:
        rules = await self.rule_storage.get_all_rules()
        
        return {
            "rules": [rule.to_dict() for rule in rules],
            "total": len(rules),
            "enabled": len([r for r in rules if r.enabled]),
            "disabled": len([r for r in rules if not r.enabled])
        }
    except Exception as e:
        logger.error("Failed to get rules", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.get("/v1/config/rules/{rule_id}")
async def get_rule(rule_id: str) -> Dict[str, Any]:
    """Get specific rule by ID"""
    try:
        rule = await self.rule_storage.get_rule(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        return {"rule": rule.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/config/rules")
async def create_rule(request: Request) -> Dict[str, Any]:
    """Create new rule"""
    try:
        data = await request.json()
        
        # Validate rule data
        rule = UnifiedRule.from_dict(data)
        validation_result = self.rule_validator.validate_rule(rule)
        
        if not validation_result.valid:
            return {
                "success": False,
                "errors": [{"field": e.field, "message": e.message} for e in validation_result.errors],
                "warnings": [{"field": w.field, "message": w.message} for w in validation_result.warnings]
            }
        
        # Set creation metadata
        rule.created_by = self._extract_user_from_request(request)
        rule.updated_by = rule.created_by
        
        # Create rule
        created_rule = await self.rule_storage.create_rule(rule)
        
        # Hot-reload rules in engine
        await self._reload_rule_engine()
        
        logger.info("Rule created", rule_id=created_rule.id, rule_name=created_rule.name, created_by=created_rule.created_by)
        
        return {
            "success": True,
            "rule": created_rule.to_dict(),
            "warnings": [{"field": w.field, "message": w.message} for w in validation_result.warnings]
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to create rule", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.put("/v1/config/rules/{rule_id}")
async def update_rule(rule_id: str, request: Request) -> Dict[str, Any]:
    """Update existing rule"""
    try:
        data = await request.json()
        
        # Get current rule
        current_rule = await self.rule_storage.get_rule(rule_id)
        if not current_rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        # Update rule
        updated_by = self._extract_user_from_request(request)
        updated_rule = await self.rule_storage.update_rule(rule_id, data, updated_by)
        
        # Validate updated rule
        validation_result = self.rule_validator.validate_rule(updated_rule)
        
        if not validation_result.valid:
            return {
                "success": False,
                "errors": [{"field": e.field, "message": e.message} for e in validation_result.errors],
                "warnings": [{"field": w.field, "message": w.message} for w in validation_result.warnings]
            }
        
        # Hot-reload rules
        await self._reload_rule_engine()
        
        logger.info("Rule updated", rule_id=rule_id, updated_by=updated_by)
        
        return {
            "success": True,
            "rule": updated_rule.to_dict(),
            "warnings": [{"field": w.field, "message": w.message} for w in validation_result.warnings]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.delete("/v1/config/rules/{rule_id}")
async def delete_rule(rule_id: str, request: Request) -> Dict[str, Any]:
    """Delete rule"""
    try:
        deleted = await self.rule_storage.delete_rule(rule_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        # Hot-reload rules
        await self._reload_rule_engine()
        
        deleted_by = self._extract_user_from_request(request)
        logger.info("Rule deleted", rule_id=rule_id, deleted_by=deleted_by)
        
        return {"success": True, "message": "Rule deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/config/rules/validate")
async def validate_rule(request: Request) -> Dict[str, Any]:
    """Validate rule without saving"""
    try:
        data = await request.json()
        
        # Create rule object
        rule = UnifiedRule.from_dict(data)
        
        # Validate rule
        validation_result = self.rule_validator.validate_rule(rule)
        
        return {
            "valid": validation_result.valid,
            "errors": [{"field": e.field, "message": e.message} for e in validation_result.errors],
            "warnings": [{"field": w.field, "message": w.message} for w in validation_result.warnings]
        }
        
    except Exception as e:
        logger.error("Failed to validate rule", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/config/rules/{rule_id}/test")
async def test_rule(rule_id: str, request: Request) -> Dict[str, Any]:
    """Test rule against sample data"""
    try:
        data = await request.json()
        
        # Get rule
        rule = await self.rule_storage.get_rule(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        # Parse test cases
        test_cases = []
        for case_data in data.get("test_cases", []):
            test_case = RuleTestCase(
                tool_name=case_data["tool_name"],
                parameters=case_data.get("parameters", {}),
                agent_id=case_data.get("agent_id", "test_agent"),
                session_id=case_data.get("session_id", "test_session"),
                cwd=case_data.get("cwd", "/tmp"),
                expected_action=case_data.get("expected_action")
            )
            test_cases.append(test_case)
        
        # Run test
        test_result = await self.rule_test_engine.test_rule(rule, test_cases)
        
        return {
            "rule_id": test_result.rule_id,
            "rule_name": test_result.rule_name,
            "overall_success": test_result.overall_success,
            "execution_time_ms": test_result.execution_time_ms,
            "test_results": [
                {
                    "test_case": {
                        "tool_name": result.test_case.tool_name,
                        "parameters": result.test_case.parameters,
                        "expected_action": result.test_case.expected_action
                    },
                    "matched": result.matched,
                    "action": result.action,
                    "reason": result.reason,
                    "confidence": result.confidence,
                    "execution_time_ms": result.execution_time_ms,
                    "expected_match": result.expected_match
                }
                for result in test_result.test_results
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to test rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

async def _reload_rule_engine(self) -> None:
    """Hot-reload rules in the evaluation engine"""
    try:
        rules = await self.rule_storage.get_all_rules()
        await self.unified_rule_engine.update_rules(rules)
        
        # Broadcast configuration update via SSE
        await self.event_streamer.broadcast_config_update()
        
    except Exception as e:
        logger.error("Failed to reload rule engine", error=str(e))
        raise

def _extract_user_from_request(self, request: Request) -> Optional[str]:
    """Extract user identity from request"""
    # Check headers for user information
    user_id = request.headers.get("x-user-id")
    if user_id:
        return user_id
    
    # Check for JWT token (simplified)
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        # In production, properly decode and validate JWT
        return f"jwt-user-{auth_header[7:15]}"
    
    # Fallback to IP
    return request.client.host if request.client else "unknown"
```

### Frontend Extensions (cco-mcp)

#### 1. Configuration Management UI Components

```typescript
// File: ui/src/components/config/RuleEditor.tsx

import React, { useState, useCallback } from 'react';
import { UnifiedRule, RuleEvaluatorType, ValidationResult } from '../../types/rules';

interface RuleEditorProps {
  rule?: UnifiedRule;
  onSave: (rule: UnifiedRule) => Promise<void>;
  onCancel: () => void;
  onValidate: (rule: UnifiedRule) => Promise<ValidationResult>;
}

export function RuleEditor({ rule, onSave, onCancel, onValidate }: RuleEditorProps) {
  const [formData, setFormData] = useState<Partial<UnifiedRule>>(
    rule || {
      name: '',
      description: '',
      enabled: true,
      priority: 100,
      evaluator: {
        type: RuleEvaluatorType.PATTERN,
        config: {
          tool_patterns: [{ name: '', type: 'builtin' }],
          action: 'always_allow'
        }
      },
      tags: []
    }
  );
  
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!formData.name || !formData.evaluator) return;
    
    const ruleToValidate = formData as UnifiedRule;
    const result = await onValidate(ruleToValidate);
    setValidation(result);
  }, [formData, onValidate]);

  const handleSave = useCallback(async () => {
    if (!validation?.valid) {
      await handleValidate();
      return;
    }
    
    setSaving(true);
    try {
      await onSave(formData as UnifiedRule);
    } finally {
      setSaving(false);
    }
  }, [formData, validation, onSave, handleValidate]);

  const handleEvaluatorTypeChange = (type: RuleEvaluatorType) => {
    const defaultConfigs = {
      [RuleEvaluatorType.PATTERN]: {
        tool_patterns: [{ name: '', type: 'builtin' }],
        action: 'always_allow'
      },
      [RuleEvaluatorType.AI_SAMPLE]: {
        tool_patterns: [{ name: '', type: 'builtin' }],
        sampling_config: {
          providers: ['claude-3.5-sonnet'],
          confidence_threshold: 0.7
        },
        fallback_action: 'auto_deny'
      }
    };

    setFormData(prev => ({
      ...prev,
      evaluator: {
        type,
        config: defaultConfigs[type] || {}
      }
    }));
  };

  return (
    <div className="rule-editor">
      <div className="form-section">
        <h3>Basic Information</h3>
        
        <div className="form-group">
          <label htmlFor="name">Rule Name *</label>
          <input
            id="name"
            type="text"
            value={formData.name || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter rule name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe what this rule does"
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="priority">Priority</label>
            <input
              id="priority"
              type="number"
              value={formData.priority || 100}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
              min="0"
              max="1000"
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.enabled ?? true}
                onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              Enabled
            </label>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Evaluation Strategy</h3>
        
        <div className="form-group">
          <label htmlFor="evaluator-type">Evaluator Type</label>
          <select
            id="evaluator-type"
            value={formData.evaluator?.type || RuleEvaluatorType.PATTERN}
            onChange={(e) => handleEvaluatorTypeChange(e.target.value as RuleEvaluatorType)}
          >
            <option value={RuleEvaluatorType.PATTERN}>Pattern Matching</option>
            <option value={RuleEvaluatorType.AI_SAMPLE}>AI Evaluation</option>
            <option value={RuleEvaluatorType.HUMAN_REVIEW} disabled>Human Review (Phase 3)</option>
            <option value={RuleEvaluatorType.CONDITIONAL} disabled>Conditional Logic (Phase 4)</option>
          </select>
        </div>

        {formData.evaluator?.type === RuleEvaluatorType.PATTERN && (
          <PatternEvaluatorConfig
            config={formData.evaluator.config}
            onChange={(config) => setFormData(prev => ({
              ...prev,
              evaluator: { ...prev.evaluator!, config }
            }))}
          />
        )}

        {formData.evaluator?.type === RuleEvaluatorType.AI_SAMPLE && (
          <AISampleEvaluatorConfig
            config={formData.evaluator.config}
            onChange={(config) => setFormData(prev => ({
              ...prev,
              evaluator: { ...prev.evaluator!, config }
            }))}
          />
        )}
      </div>

      {validation && (
        <div className="validation-results">
          {validation.errors.length > 0 && (
            <div className="validation-errors">
              <h4>Errors:</h4>
              {validation.errors.map((error, index) => (
                <div key={index} className="error-item">
                  <strong>{error.field}:</strong> {error.message}
                </div>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="validation-warnings">
              <h4>Warnings:</h4>
              {validation.warnings.map((warning, index) => (
                <div key={index} className="warning-item">
                  <strong>{warning.field}:</strong> {warning.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="form-actions">
        <button type="button" onClick={handleValidate}>
          Validate
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !validation?.valid}>
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

#### 2. Rule Management Hooks

```typescript
// File: ui/src/hooks/useRuleManagement.ts

import { useState, useCallback } from 'react';
import { UnifiedRule, ValidationResult, RuleTestResult } from '../types/rules';
import { API_CONFIG } from '../config/api';

export function useRuleManagement() {
  const [rules, setRules] = useState<UnifiedRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(async (rule: Partial<UnifiedRule>): Promise<UnifiedRule> => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.errors?.map((e: any) => e.message).join(', ') || 'Validation failed');
    }

    // Reload rules to get updated list
    await loadRules();
    return result.rule;
  }, [loadRules]);

  const updateRule = useCallback(async (ruleId: string, updates: Partial<UnifiedRule>): Promise<UnifiedRule> => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules/${ruleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.errors?.map((e: any) => e.message).join(', ') || 'Validation failed');
    }

    // Reload rules
    await loadRules();
    return result.rule;
  }, [loadRules]);

  const deleteRule = useCallback(async (ruleId: string): Promise<void> => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules/${ruleId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Reload rules
    await loadRules();
  }, [loadRules]);

  const validateRule = useCallback(async (rule: UnifiedRule): Promise<ValidationResult> => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }, []);

  const testRule = useCallback(async (ruleId: string, testCases: any[]): Promise<RuleTestResult> => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/v1/config/rules/${ruleId}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test_cases: testCases }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }, []);

  return {
    rules,
    loading,
    error,
    loadRules,
    createRule,
    updateRule,
    deleteRule,
    validateRule,
    testRule,
  };
}
```

#### 3. Updated Configuration Page

```typescript
// File: ui/src/pages/Configuration.tsx

import React, { useEffect, useState } from 'react';
import { RuleEditor } from '../components/config/RuleEditor';
import { RuleList } from '../components/config/RuleList';
import { useRuleManagement } from '../hooks/useRuleManagement';
import { UnifiedRule } from '../types/rules';

export function Configuration() {
  const {
    rules,
    loading,
    error,
    loadRules,
    createRule,
    updateRule,
    deleteRule,
    validateRule,
    testRule
  } = useRuleManagement();

  const [editingRule, setEditingRule] = useState<UnifiedRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule: UnifiedRule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleSaveRule = async (rule: UnifiedRule) => {
    try {
      if (editingRule) {
        await updateRule(editingRule.id, rule);
      } else {
        await createRule(rule);
      }
      setShowEditor(false);
      setEditingRule(null);
    } catch (err) {
      // Error handling managed by the hook
      throw err;
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      await deleteRule(ruleId);
    }
  };

  if (loading) {
    return <div className="loading">Loading configuration...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="configuration-page">
      <div className="page-header">
        <h1>Rule Configuration</h1>
        <button onClick={handleCreateRule} className="btn btn-primary">
          Create New Rule
        </button>
      </div>

      {showEditor && (
        <div className="editor-modal">
          <div className="editor-content">
            <RuleEditor
              rule={editingRule || undefined}
              onSave={handleSaveRule}
              onCancel={() => setShowEditor(false)}
              onValidate={validateRule}
            />
          </div>
        </div>
      )}

      <RuleList
        rules={rules}
        onEdit={handleEditRule}
        onDelete={handleDeleteRule}
        onTest={testRule}
      />
    </div>
  );
}
```

## Testing Strategy

### Backend Testing

#### 1. Rule Storage Tests
```python
# File: tests/test_rule_storage.py

@pytest.mark.asyncio
async def test_rule_crud_operations():
    storage = UnifiedRuleStorage("test_rules.yaml")
    
    # Create rule
    rule = UnifiedRule(
        id="test-rule",
        name="Test Rule",
        description="Test description",
        enabled=True,
        priority=100,
        evaluator=RuleEvaluatorConfig(
            type=RuleEvaluatorType.PATTERN,
            config={"tool_patterns": [{"name": "Read", "type": "builtin"}], "action": "auto_approve"}
        )
    )
    
    created = await storage.create_rule(rule)
    assert created.id == "test-rule"
    
    # Read rule
    retrieved = await storage.get_rule("test-rule")
    assert retrieved is not None
    assert retrieved.name == "Test Rule"
    
    # Update rule
    updated = await storage.update_rule("test-rule", {"name": "Updated Rule"})
    assert updated.name == "Updated Rule"
    
    # Delete rule
    deleted = await storage.delete_rule("test-rule")
    assert deleted is True
```

#### 2. Validation Tests
```python
# File: tests/test_rule_validation.py

def test_pattern_rule_validation():
    validator = RuleValidator()
    
    # Valid pattern rule
    valid_rule = UnifiedRule(
        id="valid",
        name="Valid Rule",
        enabled=True,
        priority=100,
        evaluator=RuleEvaluatorConfig(
            type=RuleEvaluatorType.PATTERN,
            config={
                "tool_patterns": [{"name": "Read", "type": "builtin"}],
                "action": "auto_approve"
            }
        )
    )
    
    result = validator.validate_rule(valid_rule)
    assert result.valid is True
    assert len(result.errors) == 0

def test_invalid_rule_validation():
    validator = RuleValidator()
    
    # Invalid rule - missing tool patterns
    invalid_rule = UnifiedRule(
        id="invalid",
        name="",  # Empty name
        enabled=True,
        priority=-1,  # Invalid priority
        evaluator=RuleEvaluatorConfig(
            type=RuleEvaluatorType.PATTERN,
            config={"action": "invalid_action"}  # Missing tool_patterns
        )
    )
    
    result = validator.validate_rule(invalid_rule)
    assert result.valid is False
    assert len(result.errors) > 0
```

### Frontend Testing

#### 1. Rule Editor Tests
```typescript
// File: ui/src/components/config/__tests__/RuleEditor.test.tsx

describe('RuleEditor', () => {
  it('renders with default pattern evaluator', () => {
    render(
      <RuleEditor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onValidate={jest.fn()}
      />
    );
    
    expect(screen.getByDisplayValue('Pattern Matching')).toBeInTheDocument();
    expect(screen.getByLabelText('Rule Name *')).toBeInTheDocument();
  });

  it('validates rule before saving', async () => {
    const mockValidate = jest.fn().mockResolvedValue({
      valid: false,
      errors: [{ field: 'name', message: 'Name is required' }]
    });
    
    render(
      <RuleEditor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onValidate={mockValidate}
      />
    );
    
    fireEvent.click(screen.getByText('Save Rule'));
    
    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalled();
    });
  });
});
```

## Success Criteria

### Functional Requirements ✅
- [ ] All rule CRUD operations work through the UI
- [ ] Pattern-based rules can be created and tested
- [ ] AI-sample rules can be created with proper configuration
- [ ] Rule validation catches all common errors
- [ ] Hot-reload updates rules without restart
- [ ] Rule testing shows accurate results

### Performance Requirements ✅
- [ ] Rule operations complete within 2 seconds
- [ ] Hot-reload takes less than 5 seconds
- [ ] No memory leaks during rule editing sessions
- [ ] UI remains responsive during rule operations

### Integration Requirements ✅
- [ ] Existing superego-mcp evaluation continues to work
- [ ] New unified rules integrate seamlessly
- [ ] SSE events include configuration updates
- [ ] Frontend and backend rule formats are compatible

## Next Steps

Upon successful completion of Phase 2:

1. **Rule Migration Tools**: Create utilities to migrate existing CCO-MCP rules
2. **Advanced Validation**: Add cross-rule conflict detection
3. **Rule Templates**: Provide common rule templates for easy setup
4. **Phase 3 Preparation**: Begin implementing human review capabilities
5. **Documentation**: Create user guides for rule management

Phase 2 establishes comprehensive rule management capabilities while maintaining compatibility with existing systems and providing a foundation for human oversight in Phase 3.