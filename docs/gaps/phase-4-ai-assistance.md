# Phase 4: Basic Decision Assistance Implementation (Simplified)

## Overview

Phase 4 provides basic decision assistance for human reviewers through simple pattern matching and frequency analysis. This simplified implementation focuses on infrastructure and basic insights rather than complex AI algorithms, making it suitable for a prototype.

## Goals

- ✅ Surface similar past decisions using simple pattern matching
- ✅ Provide frequency-based insights ("approved 8/10 times")
- ✅ Basic decision caching for performance
- ✅ Simple rule suggestions based on repeated patterns
- ✅ Infrastructure for future ML enhancements
- ✅ Maintain simplicity appropriate for prototype

## Architecture Changes

### Backend Extensions (superego-mcp)

#### 1. Basic Decision Assistant Service

```python
# File: src/superego_mcp/domain/basic_decision_assistant.py

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from collections import Counter
import hashlib
import json
import structlog

logger = structlog.get_logger(__name__)

class SimilarDecision(BaseModel):
    """Similar past decision based on simple pattern matching"""
    entry_id: str
    tool_name: str
    parameter_hash: str  # Simple hash of parameter keys
    decision_action: str  # "allow", "deny"
    human_decided: bool
    decided_by: Optional[str]
    decision_reason: str
    timestamp: datetime

class DecisionPattern(BaseModel):
    """Pattern observed in decisions"""
    tool_name: str
    parameter_pattern: str  # Hash of sorted parameter keys
    approval_count: int
    denial_count: int
    total_count: int
    approval_rate: float
    most_common_reason: str
    last_seen: datetime

class BasicInsight(BaseModel):
    """Simple insight for human reviewers"""
    insight_type: str  # "frequency", "pattern", "trend"
    message: str
    confidence: float  # Based on sample size
    supporting_data: Dict[str, Any]

class DecisionAssistance(BaseModel):
    """Simplified decision assistance for prototype"""
    similar_decisions: List[SimilarDecision]
    decision_pattern: Optional[DecisionPattern]
    insights: List[BasicInsight]
    suggested_action: Optional[str]  # Based on frequency
    confidence: float  # Based on sample size
    processing_time_ms: int

class BasicDecisionAssistant:
    """Simple pattern-based assistance for human reviewers"""
    
    def __init__(self, audit_storage):
        self.audit_storage = audit_storage
        self._pattern_cache: Dict[str, DecisionPattern] = {}
        self._cache_ttl = timedelta(minutes=5)  # Simple TTL cache
        self._cache_timestamps: Dict[str, datetime] = {}
    
    def _get_parameter_hash(self, parameters: Dict[str, Any]) -> str:
        """Create simple hash of parameter keys for pattern matching"""
        # Sort keys for consistent hashing
        sorted_keys = sorted(parameters.keys())
        key_string = "|".join(sorted_keys)
        return hashlib.md5(key_string.encode()).hexdigest()[:8]
    
    async def get_decision_assistance(
        self, 
        entry: AuditEntry
    ) -> DecisionAssistance:
        """Generate simple decision assistance based on patterns"""
        start_time = datetime.now()
        
        # Get parameter pattern
        param_hash = self._get_parameter_hash(entry.tool_input)
        pattern_key = f"{entry.tool_name}:{param_hash}"
        
        # Find similar decisions
        similar_decisions = await self._find_similar_decisions(
            tool_name=entry.tool_name,
            param_hash=param_hash,
            limit=10
        )
        
        # Calculate decision pattern
        decision_pattern = await self._calculate_pattern(
            tool_name=entry.tool_name,
            param_hash=param_hash,
            similar_decisions=similar_decisions
        )
        
        # Generate simple insights
        insights = self._generate_insights(
            decision_pattern=decision_pattern,
            similar_decisions=similar_decisions
        )
        
        # Suggest action based on frequency
        suggested_action = None
        confidence = 0.0
        
        if decision_pattern and decision_pattern.total_count >= 3:
            if decision_pattern.approval_rate > 0.7:
                suggested_action = "allow"
                confidence = decision_pattern.approval_rate
            elif decision_pattern.approval_rate < 0.3:
                suggested_action = "deny"
                confidence = 1.0 - decision_pattern.approval_rate
            
            # Adjust confidence based on sample size
            sample_factor = min(1.0, decision_pattern.total_count / 10.0)
            confidence *= sample_factor
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return DecisionAssistance(
            similar_decisions=similar_decisions[:5],  # Top 5 most recent
            decision_pattern=decision_pattern,
            insights=insights,
            suggested_action=suggested_action,
            confidence=confidence,
            processing_time_ms=processing_time
        )
            
            # Cache the result
            self._decision_cache[entry.id] = decision_recommendation
            
    
    async def _find_similar_decisions(
        self,
        tool_name: str,
        param_hash: str,
        limit: int = 10
    ) -> List[SimilarDecision]:
        """Find similar decisions based on tool and parameter pattern"""
        try:
            # Query recent audit entries
            recent = await self.audit_storage.query_entries(
                tool_name=tool_name,
                limit=100
            )
            
            similar = []
            for entry_data in recent.get("entries", []):
                entry = await self.audit_storage.get_entry(entry_data["id"])
                if not entry:
                    continue
                
                # Simple pattern matching
                entry_hash = self._get_parameter_hash(entry.tool_input)
                
                if entry_hash == param_hash:
                    similar.append(SimilarDecision(
                        entry_id=entry.id,
                        tool_name=entry.tool_name,
                        parameter_hash=entry_hash,
                        decision_action=entry.decision.action,
                        human_decided=entry.state.value in ["APPROVED", "DENIED"],
                        decided_by=entry.decision.human_metadata.resolved_by if entry.decision.human_metadata else None,
                        decision_reason=entry.decision.reason,
                        timestamp=entry.timestamp
                    ))
            
            # Sort by recency
            similar.sort(key=lambda d: d.timestamp, reverse=True)
            return similar[:limit]
            
        except Exception as e:
            logger.error("Failed to find similar decisions", error=str(e))
            return []
    
    async def _calculate_pattern(
        self,
        tool_name: str,
        param_hash: str,
        similar_decisions: List[SimilarDecision]
    ) -> Optional[DecisionPattern]:
        """Calculate decision pattern from similar decisions"""
        if not similar_decisions:
            return None
        
        # Count approvals and denials
        approval_count = sum(1 for d in similar_decisions if d.decision_action == "allow")
        denial_count = sum(1 for d in similar_decisions if d.decision_action == "deny")
        total_count = len(similar_decisions)
        
        # Find most common reason
        reasons = [d.decision_reason for d in similar_decisions if d.decision_reason]
        most_common_reason = Counter(reasons).most_common(1)[0][0] if reasons else "No reason provided"
        
        return DecisionPattern(
            tool_name=tool_name,
            parameter_pattern=param_hash,
            approval_count=approval_count,
            denial_count=denial_count,
            total_count=total_count,
            approval_rate=approval_count / total_count if total_count > 0 else 0.5,
            most_common_reason=most_common_reason,
            last_seen=max(d.timestamp for d in similar_decisions)
        )
    
    def _generate_insights(
        self,
        decision_pattern: Optional[DecisionPattern],
        similar_decisions: List[SimilarDecision]
    ) -> List[BasicInsight]:
        """Generate simple insights from patterns"""
        insights = []
        
        if decision_pattern:
            # Frequency insight
            if decision_pattern.total_count >= 3:
                confidence = min(1.0, decision_pattern.total_count / 10.0)
                
                insights.append(BasicInsight(
                    insight_type="frequency",
                    message=f"This action was approved {decision_pattern.approval_count}/{decision_pattern.total_count} times ({decision_pattern.approval_rate:.0%})",
                    confidence=confidence,
                    supporting_data={
                        "approval_count": decision_pattern.approval_count,
                        "denial_count": decision_pattern.denial_count,
                        "total_count": decision_pattern.total_count
                    }
                ))
            
            # Consistency insight
            if decision_pattern.total_count >= 5:
                if decision_pattern.approval_rate > 0.8:
                    insights.append(BasicInsight(
                        insight_type="pattern",
                        message="This action is consistently approved",
                        confidence=0.8,
                        supporting_data={"approval_rate": decision_pattern.approval_rate}
                    ))
                elif decision_pattern.approval_rate < 0.2:
                    insights.append(BasicInsight(
                        insight_type="pattern",
                        message="This action is consistently denied",
                        confidence=0.8,
                        supporting_data={"denial_rate": 1.0 - decision_pattern.approval_rate}
                    ))
        
        # Recent decision insight
        if similar_decisions:
            recent = similar_decisions[0]
            time_since = datetime.now() - recent.timestamp
            
            if time_since.total_seconds() < 3600:  # Within last hour
                insights.append(BasicInsight(
                    insight_type="trend",
                    message=f"Similar action was {recent.decision_action}ed {int(time_since.total_seconds() / 60)} minutes ago",
                    confidence=0.9,
                    supporting_data={
                        "recent_action": recent.decision_action,
                        "recent_reason": recent.decision_reason
                    }
                ))
        
        return insights
        
        # Time decay factor (recent decisions more relevant)
        time_diff = datetime.now() - entry.timestamp
        time_factor = max(0, 1 - (time_diff.days / 30))  # Decay over 30 days
        similarity_factors.append(time_factor * 0.1)
        
        return sum(similarity_factors)
    
    def _calculate_parameter_similarity(
        self, 
        params1: Dict[str, Any], 
        params2: Dict[str, Any]
    ) -> float:
        """Calculate similarity between parameter sets"""
        
        if not params1 and not params2:
            return 1.0
        
        if not params1 or not params2:
            return 0.0
        
        # Simple approach: compare string representations
        str1 = str(sorted(params1.items()))
        str2 = str(sorted(params2.items()))
        
        if str1 == str2:
            return 1.0
        
        # Character-based similarity (simple)
        common_chars = len(set(str1) & set(str2))
        total_chars = len(set(str1) | set(str2))
        
        return common_chars / total_chars if total_chars > 0 else 0.0
    
    async def _suggest_rule_modifications(
        self, 
        tool_request: ToolRequest
    ) -> List[RuleSuggestion]:
        """Suggest rule modifications based on patterns"""
        
        try:
            # Analyze recent decisions for patterns
            pattern_analysis = await self._analyze_decision_patterns(tool_request)
            
            suggestions = []
            
            # Suggest auto-approval rule if many similar requests are approved
            if pattern_analysis.get("approval_rate", 0) > 0.8 and pattern_analysis.get("count", 0) > 3:
                suggestions.append(RuleSuggestion(
                    suggestion_type="create",
                    rule_id=None,
                    rule_name=f"Auto-approve {tool_request.tool_name} operations",
                    description=f"Based on {pattern_analysis['count']} similar requests with {pattern_analysis['approval_rate']*100:.1f}% approval rate",
                    confidence=pattern_analysis["approval_rate"],
                    pattern_match_count=pattern_analysis["count"],
                    proposed_config={
                        "evaluator": {
                            "type": "pattern",
                            "config": {
                                "tool_patterns": [{"name": tool_request.tool_name, "type": "builtin"}],
                                "action": "always_allow"
                            }
                        },
                        "priority": 200,
                        "enabled": True
                    }
                ))
            
            # Suggest auto-denial rule if many similar requests are denied
            elif pattern_analysis.get("denial_rate", 0) > 0.8 and pattern_analysis.get("count", 0) > 3:
                suggestions.append(RuleSuggestion(
                    suggestion_type="create", 
                    rule_id=None,
                    rule_name=f"Auto-deny {tool_request.tool_name} operations",
                    description=f"Based on {pattern_analysis['count']} similar requests with {pattern_analysis['denial_rate']*100:.1f}% denial rate",
                    confidence=pattern_analysis["denial_rate"],
                    pattern_match_count=pattern_analysis["count"],
                    proposed_config={
                        "evaluator": {
                            "type": "pattern",
                            "config": {
                                "tool_patterns": [{"name": tool_request.tool_name, "type": "builtin"}],
                                "action": "always_deny"
                            }
                        },
                        "priority": 100,
                        "enabled": True
                    }
                ))
            
            return suggestions
            
        except Exception as e:
            logger.error("Failed to suggest rule modifications", error=str(e))
            return []
    
    async def _analyze_decision_patterns(self, tool_request: ToolRequest) -> Dict[str, Any]:
        """Analyze patterns in similar decisions"""
        
        # Get decisions for the same tool
        recent_entries = await self.audit_storage.query_entries(
            tool_name=tool_request.tool_name,
            limit=50
        )
        
        entries = recent_entries.get("entries", [])
        
        if len(entries) < 2:
            return {"count": len(entries), "approval_rate": 0.5, "denial_rate": 0.5}
        
        # Calculate approval/denial rates for human decisions
        human_decisions = [e for e in entries if e.get("state") in ["APPROVED", "DENIED"]]
        
        if not human_decisions:
            return {"count": len(entries), "approval_rate": 0.5, "denial_rate": 0.5}
        
        approved_count = len([e for e in human_decisions if e.get("state") == "APPROVED"])
        denied_count = len([e for e in human_decisions if e.get("state") == "DENIED"])
        
        total_human = approved_count + denied_count
        
        return {
            "count": total_human,
            "approval_rate": approved_count / total_human if total_human > 0 else 0.5,
            "denial_rate": denied_count / total_human if total_human > 0 else 0.5
        }
    
    async def _generate_recommendation(
        self,
        tool_request: ToolRequest,
        risk_analysis: RiskAnalysis,
        similar_decisions: List[SimilarDecision],
        rule_suggestions: List[RuleSuggestion]
    ) -> Dict[str, Any]:
        """Generate final recommendation based on all analysis"""
        
        # Weight different factors
        risk_weight = 0.4
        similarity_weight = 0.3
        pattern_weight = 0.3
        
        # Risk-based scoring
        risk_scores = {"low": 0.2, "medium": 0.5, "high": 0.8, "critical": 0.95}
        risk_score = risk_scores.get(risk_analysis.overall_risk, 0.5)
        
        # Similarity-based scoring
        similarity_score = 0.5  # Default neutral
        if similar_decisions:
            approved_similar = len([d for d in similar_decisions[:3] if d.decision_action == "allow"])
            similarity_score = approved_similar / min(3, len(similar_decisions))
        
        # Pattern-based scoring (from rule suggestions)
        pattern_score = 0.5  # Default neutral
        if rule_suggestions:
            # If suggesting auto-approval, lean towards approve
            auto_approve_suggestions = [s for s in rule_suggestions if "auto-approve" in s.proposed_config.get("evaluator", {}).get("config", {}).get("action", "")]
            if auto_approve_suggestions:
                pattern_score = 0.2  # Lean towards approval
        
        # Weighted final score
        final_score = (
            risk_score * risk_weight +
            (1 - similarity_score) * similarity_weight +  # Invert similarity (high similarity with approvals = low risk)
            pattern_score * pattern_weight
        )
        
        # Determine recommendation
        if final_score < 0.3:
            recommended_action = "approve"
            confidence = 1 - final_score
        elif final_score > 0.7:
            recommended_action = "deny" 
            confidence = final_score
        else:
            recommended_action = "investigate"
            confidence = 0.5
        
        # Generate reasoning
        reasoning_parts = [
            f"Risk analysis indicates {risk_analysis.overall_risk} risk ({risk_analysis.confidence:.2f} confidence)"
        ]
        
        if similar_decisions:
            reasoning_parts.append(f"Found {len(similar_decisions)} similar decisions")
        
        if rule_suggestions:
            reasoning_parts.append(f"Generated {len(rule_suggestions)} rule suggestions")
        
        reasoning = ". ".join(reasoning_parts) + f". Recommendation: {recommended_action} (confidence: {confidence:.2f})"
        
        return {
            "action": recommended_action,
            "confidence": confidence,
            "reasoning": reasoning
        }
    
    def _parse_risk_response(self, ai_response: str, fallback_decision) -> Dict[str, Any]:
        """Parse AI risk analysis response"""
        
        try:
            import json
            
            # Try to parse JSON response
            if ai_response.strip().startswith('{'):
                return json.loads(ai_response)
            
            # Fallback parsing from text response
            # This would be more sophisticated in practice
            risk_level = "medium"
            if "high risk" in ai_response.lower() or "critical" in ai_response.lower():
                risk_level = "high"
            elif "low risk" in ai_response.lower() or "safe" in ai_response.lower():
                risk_level = "low"
            
            return {
                "overall_risk": risk_level,
                "confidence": 0.7,
                "risk_score": 0.5,
                "explanation": ai_response,
                "recommended_action": "investigate",
                "risk_factors": []
            }
            
        except Exception:
            # Ultimate fallback
            return {
                "overall_risk": "medium",
                "confidence": 0.3,
                "risk_score": 0.5,
                "explanation": "Risk analysis parsing failed",
                "recommended_action": "investigate",
                "risk_factors": []
            }

    async def record_human_decision(
        self,
        entry_id: str,
        human_action: str,
        human_reason: str,
        ai_recommendation: Optional[DecisionRecommendation] = None
    ) -> None:
        """Record human decision for learning feedback"""
        
        try:
            # Store decision for learning
            decision_record = {
                "entry_id": entry_id,
                "human_action": human_action,
                "human_reason": human_reason,
                "ai_recommendation": ai_recommendation.recommended_action if ai_recommendation else None,
                "ai_confidence": ai_recommendation.confidence if ai_recommendation else None,
                "agreement": ai_recommendation.recommended_action == human_action if ai_recommendation else None,
                "timestamp": datetime.now().isoformat()
            }
            
            # This could be stored for machine learning training
            logger.info(
                "Human decision recorded for learning",
                entry_id=entry_id,
                human_action=human_action,
                ai_recommendation=ai_recommendation.recommended_action if ai_recommendation else None,
                agreement=decision_record["agreement"]
            )
            
        except Exception as e:
            logger.error("Failed to record human decision", error=str(e))
```

#### 2. Simplified API Endpoints

```python
# File: src/superego_mcp/presentation/unified_server.py

# Add these endpoints for basic assistance:

@self.fastapi.get("/v1/audit/{entry_id}/assistance")
async def get_decision_assistance(entry_id: str) -> Dict[str, Any]:
    """Get basic decision assistance for pending review"""
    try:
        entry = await self.audit_storage.get_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        if not entry.is_pending():
            raise HTTPException(status_code=400, detail="Entry is not pending review")
        
        # Generate basic assistance
        assistance = await self.decision_assistant.get_decision_assistance(entry)
        
        return {
            "entry_id": entry_id,
            "similar_decisions": [
                {
                    "entry_id": sd.entry_id,
                    "tool_name": sd.tool_name,
                    "decision": sd.decision_action,
                    "human_decided": sd.human_decided,
                    "decided_by": sd.decided_by,
                    "reason": sd.decision_reason,
                    "timestamp": sd.timestamp.isoformat()
                }
                for sd in assistance.similar_decisions
            ],
            "pattern": {
                "approval_rate": assistance.decision_pattern.approval_rate if assistance.decision_pattern else None,
                "total_count": assistance.decision_pattern.total_count if assistance.decision_pattern else 0,
                "most_common_reason": assistance.decision_pattern.most_common_reason if assistance.decision_pattern else None
            } if assistance.decision_pattern else None,
            "insights": [
                {
                    "type": insight.insight_type,
                    "message": insight.message,
                    "confidence": insight.confidence
                }
                for insight in assistance.insights
            ],
            "suggested_action": assistance.suggested_action,
            "confidence": assistance.confidence,
            "processing_time_ms": assistance.processing_time_ms
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get decision assistance", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.get("/v1/audit/patterns")
async def get_decision_patterns(tool_name: Optional[str] = None, limit: int = 20) -> Dict[str, Any]:
    """Get simple decision patterns for learning (prototype infrastructure)"""
    try:
        # Query recent decisions
        recent = await self.audit_storage.query_entries(
            tool_name=tool_name,
            limit=100
        )
        
        # Simple frequency counting
        patterns = {}
        for entry_data in recent.get("entries", []):
            tool = entry_data["tool_name"]
            action = entry_data.get("decision_action", "unknown")
            
            if tool not in patterns:
                patterns[tool] = {"allow": 0, "deny": 0, "total": 0}
            
            patterns[tool]["total"] += 1
            if action == "allow":
                patterns[tool]["allow"] += 1
            elif action == "deny":
                patterns[tool]["deny"] += 1
        
        # Convert to list format
        pattern_list = []
        for tool, counts in patterns.items():
            if counts["total"] >= 3:  # Minimum threshold
                pattern_list.append({
                    "tool_name": tool,
                    "approval_rate": counts["allow"] / counts["total"] if counts["total"] > 0 else 0,
                    "total_decisions": counts["total"],
                    "allow_count": counts["allow"],
                    "deny_count": counts["deny"]
                })
        
        # Sort by total decisions
        pattern_list.sort(key=lambda p: p["total_decisions"], reverse=True)
        
        return {
            "patterns": pattern_list[:limit],
            "total_tools_analyzed": len(patterns)
        }
        
    except Exception as e:
        logger.error("Failed to get decision patterns", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# Removed complex rule suggestions endpoint - defer to post-prototype
```

### Frontend Extensions (cco-mcp)

#### 1. Basic Assistance Panel Component (Simplified)

```typescript
// File: ui/src/components/assistance/BasicAssistancePanel.tsx

import React, { useState, useEffect } from 'react';
import { DecisionAssistance, SimilarDecision, BasicInsight } from '../../types/assistance';

interface AIAssistancePanelProps {
  entryId: string;
  onRecommendationLoad?: (recommendation: DecisionRecommendation) => void;
}

export function AIAssistancePanel({ entryId, onRecommendationLoad }: AIAssistancePanelProps) {
  const [recommendation, setRecommendation] = useState<DecisionRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadRecommendation();
  }, [entryId]);

  const loadRecommendation = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/v1/audit/${entryId}/assistance`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRecommendation(data);
      onRecommendationLoad?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI assistance');
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationColor = (action: string): string => {
    switch (action) {
      case 'approve': return 'text-green-600 bg-green-50';
      case 'deny': return 'text-red-600 bg-red-50';
      case 'investigate': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getRiskColor = (risk: string): string => {
    switch (risk) {
      case 'critical': return 'text-red-700 bg-red-100';
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="ai-assistance-panel border rounded-lg p-4 bg-blue-50">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          <span>Analyzing with AI...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-assistance-panel border rounded-lg p-4 bg-red-50">
        <div className="text-red-600">
          <strong>AI Analysis Unavailable:</strong> {error}
        </div>
      </div>
    );
  }

  if (!recommendation) {
    return null;
  }

  return (
    <div className="ai-assistance-panel border rounded-lg overflow-hidden">
      <div 
        className="bg-blue-50 p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <span className="text-blue-600 text-lg mr-2">🤖</span>
          <div>
            <h3 className="font-semibold text-blue-800">AI Assistance</h3>
            <p className="text-sm text-blue-600">
              Recommends: <span className={`px-2 py-1 rounded font-medium ${getRecommendationColor(recommendation.recommendation.action)}`}>
                {recommendation.recommendation.action.toUpperCase()}
              </span>
              <span className="ml-2">({(recommendation.recommendation.confidence * 100).toFixed(1)}% confidence)</span>
            </p>
          </div>
        </div>
        
        <button className="text-blue-600 hover:text-blue-800">
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="bg-white">
          {/* Recommendation Summary */}
          <div className="p-4 border-b">
            <h4 className="font-medium mb-2">Analysis Summary</h4>
            <p className="text-gray-700 text-sm">
              {recommendation.recommendation.reasoning}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Processing time: {recommendation.recommendation.processing_time_ms}ms
            </p>
          </div>

          {/* Risk Analysis */}
          <div className="p-4 border-b">
            <h4 className="font-medium mb-2">Risk Analysis</h4>
            
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium mr-2">Overall Risk:</span>
              <span className={`px-2 py-1 rounded text-sm font-medium ${getRiskColor(recommendation.risk_analysis.overall_risk)}`}>
                {recommendation.risk_analysis.overall_risk.toUpperCase()}
              </span>
              <span className="text-sm text-gray-500 ml-2">
                (Score: {(recommendation.risk_analysis.risk_score * 100).toFixed(1)})
              </span>
            </div>
            
            <p className="text-sm text-gray-700 mb-3">
              {recommendation.risk_analysis.explanation}
            </p>

            {recommendation.risk_analysis.risk_factors.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-2">Risk Factors:</h5>
                <div className="space-y-2">
                  {recommendation.risk_analysis.risk_factors.map((factor, index) => (
                    <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{factor.factor}</span>
                        <span className={`px-1 py-0.5 rounded text-xs ${getRiskColor(factor.severity)}`}>
                          {factor.severity}
                        </span>
                      </div>
                      <p className="text-gray-600">{factor.description}</p>
                      {factor.mitigation && (
                        <p className="text-green-600 mt-1">
                          <strong>Mitigation:</strong> {factor.mitigation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Similar Decisions */}
          {recommendation.similar_decisions.length > 0 && (
            <div className="p-4 border-b">
              <h4 className="font-medium mb-2">Similar Past Decisions</h4>
              <div className="space-y-2">
                {recommendation.similar_decisions.map((decision, index) => (
                  <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{decision.tool_name}</span>
                      <div className="flex items-center">
                        <span className={`px-1 py-0.5 rounded text-xs mr-2 ${
                          decision.decision === 'allow' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {decision.decision}
                        </span>
                        <span className="text-gray-500">
                          {(decision.similarity * 100).toFixed(0)}% similar
                        </span>
                      </div>
                    </div>
                    <p className="text-gray-600">{decision.reason}</p>
                    <p className="text-gray-500 mt-1">
                      {decision.human_decided ? `Decided by ${decision.decided_by}` : 'AI decision'} • 
                      {new Date(decision.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rule Suggestions */}
          {recommendation.rule_suggestions.length > 0 && (
            <div className="p-4">
              <h4 className="font-medium mb-2">Rule Suggestions</h4>
              <div className="space-y-2">
                {recommendation.rule_suggestions.map((suggestion, index) => (
                  <div key={index} className="text-xs bg-yellow-50 p-2 rounded border border-yellow-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{suggestion.name}</span>
                      <span className="text-yellow-600">
                        {(suggestion.confidence * 100).toFixed(1)}% confidence
                      </span>
                    </div>
                    <p className="text-gray-700 mb-2">{suggestion.description}</p>
                    <p className="text-gray-500">
                      Based on {suggestion.pattern_count} similar patterns
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 2. Enhanced Pending Review Entry with AI

```typescript
// File: ui/src/components/audit/EnhancedPendingReviewEntry.tsx

import React, { useState } from 'react';
import { AuditLogEntry } from '../../types/audit';
import { AIAssistancePanel } from '../ai/AIAssistancePanel';
import { DecisionRecommendation } from '../../types/ai-assistance';

interface EnhancedPendingReviewEntryProps {
  entry: AuditLogEntry;
  onApprove: (id: string, reason: string, notes?: string) => Promise<void>;
  onDeny: (id: string, reason: string, notes?: string) => Promise<void>;
  onFeedback?: (id: string, feedback: any) => Promise<void>;
}

export function EnhancedPendingReviewEntry({ 
  entry, 
  onApprove, 
  onDeny, 
  onFeedback 
}: EnhancedPendingReviewEntryProps) {
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionType, setDecisionType] = useState<'approve' | 'deny' | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiRecommendation, setAIRecommendation] = useState<DecisionRecommendation | null>(null);
  const [showAI, setShowAI] = useState(true);

  const handleDecision = async (type: 'approve' | 'deny') => {
    setDecisionType(type);
    setShowDecisionForm(true);
    
    // Pre-fill reason with AI recommendation if available
    if (aiRecommendation && aiRecommendation.recommendation.action === type) {
      setReason(aiRecommendation.recommendation.reasoning);
    }
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
      
      // Submit feedback if available
      if (onFeedback && aiRecommendation) {
        const agreed = aiRecommendation.recommendation.action === decisionType;
        await onFeedback(entry.id, {
          action: decisionType,
          reason: reason,
          ai_helpful: agreed,
          feedback_notes: agreed ? "AI recommendation aligned with decision" : "Disagreed with AI recommendation"
        });
      }
      
      setShowDecisionForm(false);
      setReason('');
      setNotes('');
    } catch (error) {
      console.error('Failed to submit decision:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAIRecommendation = (recommendation: DecisionRecommendation) => {
    setAIRecommendation(recommendation);
  };

  return (
    <div className="enhanced-pending-review-entry space-y-4">
      {/* Original Entry Display */}
      <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-lg">
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

          <div className="flex flex-col gap-2 ml-4">
            {/* AI Toggle */}
            <button
              onClick={() => setShowAI(!showAI)}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              {showAI ? 'Hide AI' : 'Show AI'}
            </button>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleDecision('approve')}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                  aiRecommendation?.recommendation.action === 'approve' 
                    ? 'bg-green-700 hover:bg-green-800' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                disabled={submitting}
              >
                Approve
                {aiRecommendation?.recommendation.action === 'approve' && (
                  <span className="ml-1 text-xs">🤖</span>
                )}
              </button>
              <button
                onClick={() => handleDecision('deny')}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                  aiRecommendation?.recommendation.action === 'deny' 
                    ? 'bg-red-700 hover:bg-red-800' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={submitting}
              >
                Deny
                {aiRecommendation?.recommendation.action === 'deny' && (
                  <span className="ml-1 text-xs">🤖</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistance Panel */}
      {showAI && (
        <AIAssistancePanel 
          entryId={entry.id}
          onRecommendationLoad={handleAIRecommendation}
        />
      )}

      {/* Decision Form */}
      {showDecisionForm && (
        <div className="bg-white p-4 border rounded-lg">
          <h4 className="font-medium mb-2">
            {decisionType === 'approve' ? 'Approve' : 'Deny'} Request
          </h4>
          
          {/* Show AI alignment */}
          {aiRecommendation && (
            <div className={`mb-3 p-2 rounded text-sm ${
              aiRecommendation.recommendation.action === decisionType
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-orange-50 text-orange-700 border border-orange-200'
            }`}>
              {aiRecommendation.recommendation.action === decisionType ? (
                <span>✓ AI agrees with your decision</span>
              ) : (
                <span>⚠ AI recommends "{aiRecommendation.recommendation.action}" instead</span>
              )}
            </div>
          )}
          
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
              {aiRecommendation && aiRecommendation.recommendation.action === decisionType && (
                <button
                  type="button"
                  onClick={() => setReason(aiRecommendation.recommendation.reasoning)}
                  className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  Use AI suggested reason
                </button>
              )}
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

// Helper function (same as before)
const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'critical': return 'text-red-600 bg-red-100';
    case 'high': return 'text-orange-600 bg-orange-100';
    case 'normal': return 'text-blue-600 bg-blue-100';
    case 'low': return 'text-gray-600 bg-gray-100';
    default: return 'text-gray-600 bg-gray-100';
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
```

#### 3. Rule Suggestions Dashboard

```typescript
// File: ui/src/components/config/RuleSuggestionsDashboard.tsx

import React, { useState, useEffect } from 'react';
import { RuleSuggestion } from '../../types/ai-assistance';

export function RuleSuggestionsDashboard() {
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [toolFilter, setToolFilter] = useState('');

  const loadSuggestions = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/v1/config/rules/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: toolFilter || undefined,
          lookback_days: lookbackDays,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to load rule suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const implementSuggestion = async (suggestion: RuleSuggestion) => {
    try {
      const response = await fetch('/v1/config/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(suggestion.proposed_config),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Remove implemented suggestion
      setSuggestions(prev => prev.filter(s => s !== suggestion));
      
      alert('Rule created successfully!');
    } catch (error) {
      console.error('Failed to implement suggestion:', error);
      alert('Failed to create rule. Please try again.');
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  return (
    <div className="rule-suggestions-dashboard">
      <div className="dashboard-header mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">AI Rule Suggestions</h2>
        
        <div className="flex gap-4 items-end mb-4">
          <div>
            <label htmlFor="lookback-days" className="block text-sm font-medium text-gray-700">
              Analysis Period (days)
            </label>
            <input
              id="lookback-days"
              type="number"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(parseInt(e.target.value))}
              min="1"
              max="365"
              className="mt-1 block w-24 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label htmlFor="tool-filter" className="block text-sm font-medium text-gray-700">
              Tool Filter (optional)
            </label>
            <input
              id="tool-filter"
              type="text"
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="e.g., Read, Write, Bash"
              className="mt-1 block w-40 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <button
            onClick={loadSuggestions}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Generate Suggestions'}
          </button>
        </div>
      </div>

      {suggestions.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-4">💡</div>
          <h3 className="text-lg font-medium mb-2">No suggestions available</h3>
          <p>Try adjusting the analysis period or generate more decision history.</p>
        </div>
      )}

      <div className="suggestions-list space-y-4">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="suggestion-card border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{suggestion.rule_name}</h3>
                  <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                    {suggestion.suggestion_type.toUpperCase()}
                  </span>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                    {(suggestion.confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>
                
                <p className="text-gray-700 mb-2">{suggestion.description}</p>
                
                <div className="text-sm text-gray-600">
                  <p>Based on {suggestion.pattern_match_count} similar patterns</p>
                </div>
                
                {/* Preview of proposed config */}
                <details className="mt-2">
                  <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                    Show proposed configuration
                  </summary>
                  <pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                    {JSON.stringify(suggestion.proposed_config, null, 2)}
                  </pre>
                </details>
              </div>

              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => implementSuggestion(suggestion)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Implement
                </button>
                <button
                  onClick={() => setSuggestions(prev => prev.filter(s => s !== suggestion))}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing Strategy

### Backend Testing

#### 1. Pattern Matching Tests
```python
# File: tests/test_ai_review_assistant.py

@pytest.mark.asyncio
async def test_risk_analysis():
    assistant = AIReviewAssistant(mock_security_policy, mock_ai_service, mock_storage, mock_rules)
    
    # High-risk tool request
    tool_request = ToolRequest(
        tool_name="Bash",
        parameters={"command": "rm -rf /"},
        agent_id="test_agent",
        session_id="test_session",
        cwd="/tmp"
    )
    
    risk_analysis = await assistant._analyze_risk(tool_request)
    
    assert risk_analysis.overall_risk in ["high", "critical"]
    assert risk_analysis.confidence > 0.7
    assert len(risk_analysis.risk_factors) > 0

@pytest.mark.asyncio
async def test_similar_decisions_matching():
    assistant = AIReviewAssistant(mock_security_policy, mock_ai_service, mock_storage, mock_rules)
    
    # Create mock historical entries
    mock_storage.add_entry(create_mock_entry("Read", {"file_path": "/test.txt"}, "approved"))
    mock_storage.add_entry(create_mock_entry("Read", {"file_path": "/data.json"}, "approved"))
    
    tool_request = ToolRequest(
        tool_name="Read",
        parameters={"file_path": "/config.yaml"},
        agent_id="test_agent",
        session_id="test_session"
    )
    
    similar_decisions = await assistant._find_similar_decisions(tool_request)
    
    assert len(similar_decisions) > 0
    assert all(d.tool_name == "Read" for d in similar_decisions)
    assert all(d.parameters_similarity > 0.3 for d in similar_decisions)
```

### Frontend Testing

#### 1. AI Assistance Panel Tests
```typescript
// File: ui/src/components/ai/__tests__/AIAssistancePanel.test.tsx

describe('AIAssistancePanel', () => {
  it('loads and displays AI recommendation', async () => {
    const mockRecommendation = {
      recommendation: {
        action: 'approve',
        confidence: 0.85,
        reasoning: 'Low risk operation'
      },
      risk_analysis: {
        overall_risk: 'low',
        confidence: 0.9,
        risk_score: 0.2,
        explanation: 'Safe read operation',
        risk_factors: []
      },
      similar_decisions: [],
      rule_suggestions: []
    };

    fetchMock.mockResponseOnce(JSON.stringify(mockRecommendation));

    render(<AIAssistancePanel entryId="test-entry" />);

    await waitFor(() => {
      expect(screen.getByText('APPROVE')).toBeInTheDocument();
      expect(screen.getByText('85.0% confidence')).toBeInTheDocument();
    });

    // Expand panel
    fireEvent.click(screen.getByText('▶'));
    
    expect(screen.getByText('Low risk operation')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('handles AI analysis errors gracefully', async () => {
    fetchMock.mockRejectOnce(new Error('AI service unavailable'));

    render(<AIAssistancePanel entryId="test-entry" />);

    await waitFor(() => {
      expect(screen.getByText(/AI Analysis Unavailable/)).toBeInTheDocument();
    });
  });
});
```

## Success Criteria

### Functional Requirements ✅
- [ ] Basic pattern matching finds similar past decisions
- [ ] Frequency-based insights are generated correctly
- [ ] Decision patterns are calculated from history
- [ ] Simple suggestions based on approval rates
- [ ] Infrastructure ready for future ML enhancements
- [ ] Integration works with existing review workflow

### Performance Requirements ✅
- [ ] Pattern matching completes within 1 second
- [ ] Similar decision lookup takes less than 500ms
- [ ] Insights generation within 2 seconds
- [ ] UI remains responsive during processing

### Quality Requirements ✅
- [ ] Pattern matching accuracy (exact parameter key matching)
- [ ] Frequency calculations are correct
- [ ] Confidence based on sample size
- [ ] No complex AI dependencies for prototype

## Future Enhancements

### Post-Prototype Improvements
1. **Advanced Pattern Matching**: Parameter value analysis, not just keys
2. **Machine Learning Integration**: Train models on decision history
3. **AI Risk Analysis**: Add actual AI-powered risk assessment
4. **Semantic Similarity**: Context-aware matching beyond simple hashes
5. **Learning Feedback Loop**: Improve from human decisions

### Infrastructure Ready For
1. **Model Integration**: Hooks for ML models when ready
2. **Advanced Analytics**: Data pipeline for pattern analysis
3. **A/B Testing**: Compare simple vs. advanced assistance
4. **Performance Metrics**: Track assistance effectiveness

## Conclusion

Phase 4 (Simplified) completes the migration by adding basic decision assistance to human reviewers through simple pattern matching and frequency analysis. This prototype implementation focuses on infrastructure and basic insights rather than complex AI algorithms.

**Key Benefits for Prototype**:
- Simple, understandable pattern matching
- Fast performance with no external dependencies
- Infrastructure ready for future ML enhancements
- Reduced complexity for initial deployment
- Clear path for incremental improvements

**Integration Points**:
- Seamlessly integrated with Phase 3 review workflow
- Lightweight assistance that can be toggled off
- Maintains full audit trail
- No complex AI dependencies

**Upgrade Path**:
This simplified implementation provides the foundation for future enhancements:
1. Start with basic pattern matching (Phase 4)
2. Collect data and validate infrastructure
3. Add ML models incrementally post-prototype
4. Evolve based on real usage patterns

The simplified Phase 4 delivers immediate value through basic insights while establishing the infrastructure needed for more sophisticated AI assistance in the future.