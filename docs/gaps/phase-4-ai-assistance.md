# Phase 4: AI-Assisted Review Implementation

## Overview

Phase 4 enhances the human review process with AI-powered assistance, providing reviewers with intelligent insights, risk analysis, and decision recommendations. This phase leverages superego-mcp's existing AI capabilities to augment human decision-making rather than replace it.

## Goals

- ✅ Provide AI risk analysis for pending reviews
- ✅ Surface similar past decisions to inform current reviews
- ✅ Generate decision explanations and confidence scores
- ✅ Recommend rule modifications based on decision patterns
- ✅ Implement learning feedback loops from human decisions
- ✅ Maintain human autonomy while providing intelligent assistance

## Architecture Changes

### Backend Extensions (superego-mcp)

#### 1. AI Review Assistant Service

```python
# File: src/superego_mcp/domain/ai_review_assistant.py

from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from ..domain.models import AuditEntry, ToolRequest, Decision
from ..domain.security_policy import SecurityPolicyEngine
from ..infrastructure.ai_service import AIService
import structlog

logger = structlog.get_logger(__name__)

class RiskFactor(BaseModel):
    """Individual risk factor identified by AI analysis"""
    factor: str
    severity: str  # "low", "medium", "high", "critical"
    confidence: float
    description: str
    mitigation: Optional[str] = None

class RiskAnalysis(BaseModel):
    """Comprehensive risk analysis for a tool request"""
    overall_risk: str  # "low", "medium", "high", "critical"
    confidence: float
    risk_factors: List[RiskFactor]
    risk_score: float  # 0.0 to 1.0
    explanation: str
    recommended_action: str  # "approve", "deny", "investigate"
    similar_decisions_weight: float = Field(default=0.0)

class SimilarDecision(BaseModel):
    """Similar past decision for context"""
    entry_id: str
    tool_name: str
    parameters_similarity: float
    decision_action: str
    human_decided: bool
    decided_by: Optional[str]
    decision_reason: str
    confidence: float
    timestamp: datetime

class DecisionRecommendation(BaseModel):
    """AI recommendation for human decision"""
    recommended_action: str  # "approve", "deny"
    confidence: float
    reasoning: str
    risk_analysis: RiskAnalysis
    similar_decisions: List[SimilarDecision]
    suggested_rules: List['RuleSuggestion']
    processing_time_ms: int

class RuleSuggestion(BaseModel):
    """Suggested rule modification based on patterns"""
    suggestion_type: str  # "create", "modify", "disable"
    rule_id: Optional[str]  # None for create
    rule_name: str
    description: str
    confidence: float
    pattern_match_count: int
    proposed_config: Dict[str, Any]

class AIReviewAssistant:
    """AI-powered assistance for human reviewers"""
    
    def __init__(
        self,
        security_policy: SecurityPolicyEngine,
        ai_service: AIService,
        audit_storage,
        rule_storage
    ):
        self.security_policy = security_policy
        self.ai_service = ai_service
        self.audit_storage = audit_storage
        self.rule_storage = rule_storage
        self._decision_cache: Dict[str, DecisionRecommendation] = {}
    
    async def analyze_pending_review(
        self, 
        entry: EnhancedAuditEntry
    ) -> DecisionRecommendation:
        """Generate comprehensive analysis and recommendation for pending review"""
        
        if entry.id in self._decision_cache:
            return self._decision_cache[entry.id]
        
        start_time = datetime.now()
        
        try:
            # Create tool request for analysis
            tool_request = ToolRequest(
                tool_name=entry.tool_name,
                parameters=entry.tool_input,
                agent_id=entry.agent_identity or "unknown",
                session_id=entry.session_id,
                cwd=entry.cwd
            )
            
            # Run parallel analysis tasks
            risk_analysis_task = self._analyze_risk(tool_request)
            similar_decisions_task = self._find_similar_decisions(tool_request, limit=5)
            rule_suggestions_task = self._suggest_rule_modifications(tool_request)
            
            risk_analysis = await risk_analysis_task
            similar_decisions = await similar_decisions_task
            rule_suggestions = await rule_suggestions_task
            
            # Generate final recommendation
            recommendation = await self._generate_recommendation(
                tool_request,
                risk_analysis,
                similar_decisions,
                rule_suggestions
            )
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            decision_recommendation = DecisionRecommendation(
                recommended_action=recommendation["action"],
                confidence=recommendation["confidence"],
                reasoning=recommendation["reasoning"],
                risk_analysis=risk_analysis,
                similar_decisions=similar_decisions,
                suggested_rules=rule_suggestions,
                processing_time_ms=processing_time
            )
            
            # Cache the result
            self._decision_cache[entry.id] = decision_recommendation
            
            logger.info(
                "AI review assistance generated",
                entry_id=entry.id,
                recommended_action=recommendation["action"],
                confidence=recommendation["confidence"],
                processing_time_ms=processing_time
            )
            
            return decision_recommendation
            
        except Exception as e:
            logger.error("Failed to generate AI review assistance", entry_id=entry.id, error=str(e))
            
            # Return fallback recommendation
            return DecisionRecommendation(
                recommended_action="investigate",
                confidence=0.1,
                reasoning=f"Analysis failed: {str(e)}. Manual review required.",
                risk_analysis=RiskAnalysis(
                    overall_risk="medium",
                    confidence=0.1,
                    risk_factors=[],
                    risk_score=0.5,
                    explanation="Analysis unavailable due to error",
                    recommended_action="investigate"
                ),
                similar_decisions=[],
                suggested_rules=[],
                processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
            )
    
    async def _analyze_risk(self, tool_request: ToolRequest) -> RiskAnalysis:
        """Perform detailed risk analysis using AI"""
        
        # Enhanced prompt for risk analysis
        risk_prompt = f"""
        Analyze the security risk of this tool request:
        
        Tool: {tool_request.tool_name}
        Parameters: {tool_request.parameters}
        Context: Agent {tool_request.agent_id} in session {tool_request.session_id}
        Working Directory: {tool_request.cwd}
        
        Provide a detailed risk analysis including:
        1. Overall risk level (low/medium/high/critical)
        2. Specific risk factors with severity and description
        3. Risk score (0.0 to 1.0)
        4. Explanation of the risks
        5. Recommended action (approve/deny/investigate)
        
        Consider:
        - Potential for data loss or system damage
        - Network security implications
        - File system access patterns
        - Command injection risks
        - Privilege escalation potential
        - Information disclosure risks
        
        Format your response as JSON with the following structure:
        {{
            "overall_risk": "level",
            "confidence": 0.9,
            "risk_score": 0.7,
            "explanation": "detailed explanation",
            "recommended_action": "action",
            "risk_factors": [
                {{
                    "factor": "factor name",
                    "severity": "level",
                    "confidence": 0.8,
                    "description": "detailed description",
                    "mitigation": "possible mitigation"
                }}
            ]
        }}
        """
        
        try:
            # Use AI service for analysis
            decision = await self.security_policy.evaluate(tool_request)
            
            # Enhanced analysis with dedicated risk prompt
            risk_response = await self.ai_service.sample_decision(
                tool_request=tool_request,
                context={"analysis_type": "risk_assessment", "prompt": risk_prompt}
            )
            
            # Parse AI response (simplified - in practice would need robust JSON parsing)
            risk_data = self._parse_risk_response(risk_response, decision)
            
            return RiskAnalysis(
                overall_risk=risk_data.get("overall_risk", "medium"),
                confidence=risk_data.get("confidence", 0.5),
                risk_score=risk_data.get("risk_score", 0.5),
                explanation=risk_data.get("explanation", "Risk analysis completed"),
                recommended_action=risk_data.get("recommended_action", "investigate"),
                risk_factors=[
                    RiskFactor(
                        factor=rf.get("factor", "Unknown"),
                        severity=rf.get("severity", "medium"),
                        confidence=rf.get("confidence", 0.5),
                        description=rf.get("description", ""),
                        mitigation=rf.get("mitigation")
                    )
                    for rf in risk_data.get("risk_factors", [])
                ]
            )
            
        except Exception as e:
            logger.error("Risk analysis failed", error=str(e))
            
            # Fallback analysis
            return RiskAnalysis(
                overall_risk="medium",
                confidence=0.3,
                risk_score=0.5,
                explanation=f"Automated risk analysis failed: {str(e)}",
                recommended_action="investigate",
                risk_factors=[
                    RiskFactor(
                        factor="Analysis Error",
                        severity="medium",
                        confidence=0.3,
                        description="Automated analysis could not complete successfully"
                    )
                ]
            )
    
    async def _find_similar_decisions(
        self, 
        tool_request: ToolRequest, 
        limit: int = 5
    ) -> List[SimilarDecision]:
        """Find similar past decisions for context"""
        
        try:
            # Query recent audit entries
            recent_entries = await self.audit_storage.query_entries(limit=500)
            
            similar_decisions = []
            
            for entry_data in recent_entries.get("entries", []):
                entry = await self.audit_storage.get_entry(entry_data["id"])
                if not entry:
                    continue
                
                # Calculate similarity
                similarity_score = self._calculate_similarity(tool_request, entry)
                
                if similarity_score > 0.3:  # Threshold for similarity
                    similar_decision = SimilarDecision(
                        entry_id=entry.id,
                        tool_name=entry.tool_name,
                        parameters_similarity=similarity_score,
                        decision_action=entry.decision_action,
                        human_decided=entry.state in ["approved", "denied"],
                        decided_by=entry.decision_metadata.decided_by if entry.decision_metadata else None,
                        decision_reason=entry.decision_metadata.decision_reason if entry.decision_metadata else entry.decision_reason,
                        confidence=entry.decision_confidence,
                        timestamp=entry.timestamp
                    )
                    
                    similar_decisions.append(similar_decision)
            
            # Sort by similarity and recency
            similar_decisions.sort(key=lambda d: (d.parameters_similarity, d.timestamp), reverse=True)
            
            return similar_decisions[:limit]
            
        except Exception as e:
            logger.error("Failed to find similar decisions", error=str(e))
            return []
    
    def _calculate_similarity(
        self, 
        tool_request: ToolRequest, 
        entry: EnhancedAuditEntry
    ) -> float:
        """Calculate similarity score between requests"""
        
        similarity_factors = []
        
        # Tool name match (high weight)
        if tool_request.tool_name == entry.tool_name:
            similarity_factors.append(0.4)
        
        # Parameter similarity (medium weight)
        param_similarity = self._calculate_parameter_similarity(
            tool_request.parameters, 
            entry.tool_input
        )
        similarity_factors.append(param_similarity * 0.3)
        
        # Agent similarity (low weight)  
        if tool_request.agent_id == entry.agent_identity:
            similarity_factors.append(0.1)
        
        # Working directory similarity (low weight)
        if tool_request.cwd and entry.cwd and tool_request.cwd == entry.cwd:
            similarity_factors.append(0.1)
        
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

#### 2. Enhanced API Endpoints

```python
# File: src/superego_mcp/presentation/unified_server.py

# Add these endpoints for AI assistance:

@self.fastapi.get("/v1/audit/{entry_id}/assistance")
async def get_ai_assistance(entry_id: str) -> Dict[str, Any]:
    """Get AI assistance for pending review"""
    try:
        entry = await self.audit_storage.get_entry(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        if not entry.is_pending():
            raise HTTPException(status_code=400, detail="Entry is not pending review")
        
        # Generate AI assistance
        recommendation = await self.ai_review_assistant.analyze_pending_review(entry)
        
        return {
            "entry_id": entry_id,
            "recommendation": {
                "action": recommendation.recommended_action,
                "confidence": recommendation.confidence,
                "reasoning": recommendation.reasoning,
                "processing_time_ms": recommendation.processing_time_ms
            },
            "risk_analysis": {
                "overall_risk": recommendation.risk_analysis.overall_risk,
                "confidence": recommendation.risk_analysis.confidence,
                "risk_score": recommendation.risk_analysis.risk_score,
                "explanation": recommendation.risk_analysis.explanation,
                "risk_factors": [
                    {
                        "factor": rf.factor,
                        "severity": rf.severity,
                        "confidence": rf.confidence,
                        "description": rf.description,
                        "mitigation": rf.mitigation
                    }
                    for rf in recommendation.risk_analysis.risk_factors
                ]
            },
            "similar_decisions": [
                {
                    "entry_id": sd.entry_id,
                    "tool_name": sd.tool_name,
                    "similarity": sd.parameters_similarity,
                    "decision": sd.decision_action,
                    "human_decided": sd.human_decided,
                    "decided_by": sd.decided_by,
                    "reason": sd.decision_reason,
                    "timestamp": sd.timestamp.isoformat()
                }
                for sd in recommendation.similar_decisions
            ],
            "rule_suggestions": [
                {
                    "type": rs.suggestion_type,
                    "rule_id": rs.rule_id,
                    "name": rs.rule_name,
                    "description": rs.description,
                    "confidence": rs.confidence,
                    "pattern_count": rs.pattern_match_count,
                    "config": rs.proposed_config
                }
                for rs in recommendation.suggested_rules
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get AI assistance", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/audit/{entry_id}/feedback")
async def record_decision_feedback(entry_id: str, request: Request) -> Dict[str, Any]:
    """Record human decision feedback for AI learning"""
    try:
        data = await request.json()
        
        human_action = data.get("action")  # "approve" or "deny"
        human_reason = data.get("reason", "")
        ai_helpful = data.get("ai_helpful", True)  # Boolean feedback
        feedback_notes = data.get("feedback_notes", "")
        
        if not human_action or human_action not in ["approve", "deny"]:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        # Get AI recommendation if it exists in cache
        ai_recommendation = self.ai_review_assistant._decision_cache.get(entry_id)
        
        # Record feedback
        await self.ai_review_assistant.record_human_decision(
            entry_id=entry_id,
            human_action=human_action,
            human_reason=human_reason,
            ai_recommendation=ai_recommendation
        )
        
        # Store additional feedback
        feedback_record = {
            "entry_id": entry_id,
            "human_action": human_action,
            "ai_helpful": ai_helpful,
            "feedback_notes": feedback_notes,
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(
            "Decision feedback recorded",
            entry_id=entry_id,
            human_action=human_action,
            ai_helpful=ai_helpful
        )
        
        return {"success": True, "message": "Feedback recorded"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to record feedback", entry_id=entry_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@self.fastapi.post("/v1/config/rules/suggestions")
async def get_rule_suggestions(request: Request) -> Dict[str, Any]:
    """Get AI-generated rule suggestions based on decision patterns"""
    try:
        data = await request.json()
        
        # Allow suggestions based on specific tool or general patterns
        tool_name = data.get("tool_name")
        lookback_days = data.get("lookback_days", 30)
        
        # Analyze recent decisions for patterns
        end_date = datetime.now()
        start_date = end_date - timedelta(days=lookback_days)
        
        recent_entries = await self.audit_storage.query_entries(
            tool_name=tool_name,
            limit=500
        )
        
        suggestions = []
        
        # Group by tool name and analyze patterns
        tool_patterns = {}
        
        for entry_data in recent_entries.get("entries", []):
            entry = await self.audit_storage.get_entry(entry_data["id"])
            if not entry or entry.timestamp < start_date:
                continue
            
            tool = entry.tool_name
            if tool not in tool_patterns:
                tool_patterns[tool] = {"approved": 0, "denied": 0, "total": 0}
            
            tool_patterns[tool]["total"] += 1
            
            if entry.state == "approved":
                tool_patterns[tool]["approved"] += 1
            elif entry.state == "denied":
                tool_patterns[tool]["denied"] += 1
        
        # Generate suggestions based on patterns
        for tool, patterns in tool_patterns.items():
            if patterns["total"] < 3:  # Need minimum decisions
                continue
            
            approval_rate = patterns["approved"] / patterns["total"]
            denial_rate = patterns["denied"] / patterns["total"]
            
            if approval_rate > 0.8:
                suggestions.append({
                    "type": "create",
                    "rule_name": f"Auto-approve {tool} operations",
                    "description": f"Based on {patterns['total']} decisions with {approval_rate*100:.1f}% approval rate",
                    "confidence": approval_rate,
                    "evidence_count": patterns["total"],
                    "proposed_config": {
                        "name": f"Auto-approve {tool} operations",
                        "evaluator": {
                            "type": "pattern",
                            "config": {
                                "tool_patterns": [{"name": tool, "type": "builtin"}],
                                "action": "always_allow"
                            }
                        },
                        "priority": 200,
                        "enabled": True
                    }
                })
            
            elif denial_rate > 0.8:
                suggestions.append({
                    "type": "create", 
                    "rule_name": f"Auto-deny {tool} operations",
                    "description": f"Based on {patterns['total']} decisions with {denial_rate*100:.1f}% denial rate",
                    "confidence": denial_rate,
                    "evidence_count": patterns["total"],
                    "proposed_config": {
                        "name": f"Auto-deny {tool} operations",
                        "evaluator": {
                            "type": "pattern",
                            "config": {
                                "tool_patterns": [{"name": tool, "type": "builtin"}],
                                "action": "always_deny"
                            }
                        },
                        "priority": 100,
                        "enabled": True
                    }
                })
        
        return {
            "suggestions": suggestions,
            "analysis_period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "total_decisions": sum(p["total"] for p in tool_patterns.values())
            }
        }
        
    except Exception as e:
        logger.error("Failed to get rule suggestions", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

### Frontend Extensions (cco-mcp)

#### 1. AI Assistance Panel Component

```typescript
// File: ui/src/components/ai/AIAssistancePanel.tsx

import React, { useState, useEffect } from 'react';
import { DecisionRecommendation, RiskAnalysis, SimilarDecision, RuleSuggestion } from '../../types/ai-assistance';

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

#### 1. AI Analysis Tests
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
- [ ] AI assistance provides risk analysis for pending reviews
- [ ] Similar past decisions are surfaced with similarity scores
- [ ] Rule suggestions are generated based on decision patterns
- [ ] Human reviewers can accept or reject AI recommendations
- [ ] Feedback is collected for AI improvement
- [ ] Integration works seamlessly with existing review workflow

### Performance Requirements ✅
- [ ] AI analysis completes within 10 seconds
- [ ] Similar decision lookup takes less than 5 seconds
- [ ] Rule suggestions generate within 15 seconds
- [ ] UI remains responsive during AI processing

### Quality Requirements ✅
- [ ] AI risk analysis accuracy > 70% correlation with human judgment
- [ ] Similar decision matching identifies relevant cases
- [ ] Rule suggestions reduce manual reviews by 20%+
- [ ] Human-AI agreement rate tracked and improving over time

## Future Enhancements

### Post-Phase 4 Improvements
1. **Machine Learning Integration**: Train models on decision history
2. **Advanced Pattern Recognition**: Context-aware similarity matching
3. **Predictive Analytics**: Forecast rule effectiveness
4. **Multi-modal Analysis**: Incorporate code analysis, network patterns
5. **Personalized Recommendations**: Adapt to individual reviewer preferences

### AI Model Improvements
1. **Fine-tuned Security Models**: Domain-specific risk assessment
2. **Ensemble Methods**: Multiple AI opinions for complex cases
3. **Confidence Calibration**: Better uncertainty quantification
4. **Explainable AI**: More detailed reasoning for decisions

## Conclusion

Phase 4 completes the migration by adding intelligent assistance to human reviewers, creating a collaborative human-AI system that improves over time. The AI provides insights and recommendations while preserving human autonomy and decision-making authority.

**Key Benefits**:
- Faster, more informed human decisions
- Learning from human expertise
- Automated rule generation from patterns
- Reduced cognitive load on reviewers
- Continuous improvement through feedback

**Integration Points**:
- Seamlessly integrated with Phase 3 review workflow
- Non-intrusive AI assistance (can be toggled off)
- Maintains full audit trail including AI inputs
- Respects human final authority

This comprehensive system provides both automated evaluation and human oversight, with AI assistance that learns and improves from human decisions, creating a robust and adaptive security review system.